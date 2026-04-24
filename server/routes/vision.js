import express from 'express';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { authenticateToken } from '../middleware/auth.js';
import db from '../database.js';

const router = express.Router();

router.post('/scan', authenticateToken, async (req, res) => {
  try {
    const { image } = req.body; // Base64 image data

    if (!image) {
      return res.status(400).json({ error: 'No image data provided' });
    }

    // Try env first, then database
    let apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      const setting = db.prepare("SELECT value FROM settings WHERE key = 'gemini_api_key'").get();
      if (setting && setting.value) {
        apiKey = setting.value;
      }
    }

    if (!apiKey) {
      return res.status(500).json({ error: 'Gemini API key not configured in settings or environment' });
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    // Fetch existing inventory item names for fuzzy matching help
    const existingItems = db.prepare('SELECT name FROM inventory WHERE is_archived = 0').all();
    const itemNames = existingItems.map(i => i.name).join(', ');

    const prompt = `
      You are an expert inventory assistant specialized in reading handwritten documents, delivery notes, and receipts. I am uploading an image of a handwritten or printed inventory document.
      
      TASK:
      1. Carefully read the handwriting and extract all items, quantities, and unit prices.
      2. If you see a total price but no unit price, calculate unit price = total / quantity.
      3. For each extracted item, attempt to match it with one of the following valid item names from our system: [${itemNames}].
      4. If a match is found based on similarities, use the EXACT name from our system. If no match is found or you are unsure due to handwriting constraints, use the name exactly as it appears in the image.
      
      RETURN FORMAT:
      Return ONLY a JSON array of objects with these keys: 
      "name" (the system name or extracted name), 
      "original" (the raw handwritten text from the image), 
      "quantity" (number), 
      "price" (number, unit price),
      "confidence" (0-1 score representing handwriting legibility confidence)
      
      IMPORTANT: Return ONLY the JSON array. No markdown, no "json" backticks, no explanatory text.
    `;

    const mimeTypeMatch = image.match(/^data:(image\/\w+);base64,/);
    const mimeType = mimeTypeMatch ? mimeTypeMatch[1] : 'image/jpeg';
    const base64Data = image.includes(',') ? image.split(',')[1] : image;

    // Process the base64 image
    const imageParts = [
      {
        inlineData: {
          data: base64Data,
          mimeType: mimeType
        }
      }
    ];

    const result = await model.generateContent([prompt, ...imageParts]);
    const response = await result.response;
    let text = response.text();

    // Clean any potential markdown wrapping
    text = text.replace(/```json/g, '').replace(/```/g, '').trim();

    try {
      const parsedData = JSON.parse(text);
      res.json(parsedData);
    } catch (parseError) {
      console.error('Gemini parsing error. Raw text:', text);
      res.status(500).json({ error: 'Failed to parse AI response. Ensure the image is legible.', raw: text });
    }

  } catch (error) {
    console.error('Vision scan error:', error);
    res.status(500).json({ 
      error: error.message || 'Internal server error while processing image' 
    });
  }
});

export default router;
