import React, { useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Camera, Upload, X, Check, Loader2, AlertCircle } from 'lucide-react';
import { fetchApi } from '../lib/api';

interface ExtractedItem {
  name: string;
  original: string;
  quantity: number;
  price: number;
  confidence: number;
}

interface ScanModalProps {
  onClose: () => void;
  onApply: (items: any[]) => void;
  title?: string;
}

const ScanModal: React.FC<ScanModalProps> = ({ onClose, onApply, title }) => {
  const { t } = useTranslation();
  const [image, setImage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<ExtractedItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setImage(reader.result as string);
        setError(null);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleScan = async () => {
    if (!image) return;
    setLoading(true);
    setError(null);
    try {
      const data = await fetchApi('/api/vision/scan', {
        method: 'POST',
        body: JSON.stringify({ image })
      });
      setResults(data);
    } catch (err: any) {
      console.error('Scan failed:', err);
      setError(err.message || 'Failed to process image');
    } finally {
      setLoading(false);
    }
  };



  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-[100]">
      <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        <div className="p-4 border-b flex justify-between items-center bg-gray-50">
          <h2 className="text-xl font-bold flex items-center">
            <Camera className="w-5 h-5 mr-2 text-navy" />
            {title || t('scan_document')}
          </h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {!results.length ? (
            <div className="flex flex-col items-center justify-center h-full min-h-[300px]">
              {image ? (
                <div className="relative w-full max-w-md aspect-video mb-6 border-2 border-dashed border-navy rounded-lg overflow-hidden bg-gray-100">
                  <img src={image} alt="Preview" className="w-full h-full object-contain" />
                  <button 
                    onClick={() => setImage(null)}
                    className="absolute top-2 right-2 p-1 bg-white rounded-full shadow-md text-red-500 hover:bg-red-50"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <div 
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full max-w-md aspect-video mb-6 border-2 border-dashed border-gray-300 rounded-lg flex flex-col items-center justify-center cursor-pointer hover:border-navy hover:bg-gray-50 transition-colors group"
                >
                  <Upload className="w-12 h-12 text-gray-400 group-hover:text-navy mb-2" />
                  <p className="text-gray-600 font-medium">{t('click_to_upload_or_drag')}</p>
                  <p className="text-xs text-gray-400 mt-1">Supports JPG, PNG</p>
                  <input 
                    type="file" 
                    ref={fileInputRef} 
                    onChange={handleFileChange} 
                    className="hidden" 
                    accept="image/*" 
                  />
                </div>
              )}

              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4 flex items-center">
                  <AlertCircle className="w-5 h-5 mr-3 flex-shrink-0" />
                  <span className="text-sm">{error}</span>
                </div>
              )}

              <button
                onClick={handleScan}
                disabled={!image || loading}
                className="px-8 py-3 bg-navy text-white rounded-lg font-bold shadow-lg hover:bg-opacity-90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center transition-all"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                    {t('reading_with_ai')}...
                  </>
                ) : (
                  <>
                    {t('scan_and_extract')}
                  </>
                )}
              </button>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-center">
                <Check className="w-5 h-5 text-green-600 mr-3" />
                <p className="text-sm text-green-800">{t('scan_success_message', { count: results.length })}</p>
              </div>

              <div className="border rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr className="border-b">
                      <th className="text-left p-3">{t('extracted_item')}</th>
                      <th className="text-left p-3">{t('system_match')}</th>
                      <th className="text-center p-3">{t('quantity')}</th>
                      <th className="text-right p-3">{t('price')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.map((item, idx) => (
                      <tr key={idx} className="border-b last:border-0 hover:bg-gray-50">
                        <td className="p-3 italic text-gray-500">{item.original}</td>
                        <td className="p-3 font-medium text-navy">{item.name}</td>
                        <td className="p-3 text-center">
                          <input 
                            type="number" 
                            className="w-16 text-center border rounded p-1"
                            value={item.quantity}
                            onChange={(e) => {
                                const newResults = [...results];
                                newResults[idx].quantity = Number(e.target.value);
                                setResults(newResults);
                            }}
                          />
                        </td>
                        <td className="p-3 text-right">
                          <input 
                            type="number" 
                            className="w-24 text-right border rounded p-1"
                            value={item.price}
                            onChange={(e) => {
                                const newResults = [...results];
                                newResults[idx].price = Number(e.target.value);
                                setResults(newResults);
                            }}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex justify-end space-x-3">
                <button 
                  onClick={() => setResults([])}
                  className="px-4 py-2 border rounded-lg hover:bg-gray-50"
                >
                  {t('retry')}
                </button>
                <button 
                  onClick={() => onApply(results)}
                  className="px-6 py-2 bg-navy text-white rounded-lg font-bold hover:bg-opacity-90"
                >
                  {t('apply_to_form')}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ScanModal;
