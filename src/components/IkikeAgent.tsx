import React, { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { 
  Sparkles, Send, Paperclip, X, Check, Brain, 
  Loader2, AlertCircle, CheckCircle2 
} from 'lucide-react';
import { fetchApi } from '../lib/api';

interface Message {
  id: string;
  role: 'user' | 'agent';
  content: string;
  image?: string;
  action?: {
    type: string;
    data: any;
    summary: string;
    status: 'pending' | 'approved' | 'rejected';
  };
}

export const IkikeAgent: React.FC = () => {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      role: 'agent',
      content: t('ikike_chat_welcome', 'I am IKIKÉ, your elite strategic advisor. I can analyze inventory, fleet data, granite trips, and ledger transactions. You can also upload scanned receipts or documents for automated data entry and verification.'),
      action: undefined
    }
  ]);
  const [inputMessage, setInputMessage] = useState('');
  const [attachedImage, setAttachedImage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading, isOpen]);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onloadend = () => {
      setAttachedImage(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const parseActionBlock = (text: string): { action: any; cleanText: string } => {
    const actionRegex = /```action([\s\S]*?)```/g;
    const match = actionRegex.exec(text);
    
    if (match && match[1]) {
      try {
        const actionObj = JSON.parse(match[1].trim());
        const cleanText = text.replace(actionRegex, '').trim();
        return {
          action: {
            ...actionObj,
            status: 'pending' as const
          },
          cleanText: cleanText || t('ikike_propose_title', 'Action Proposed by Ikiké')
        };
      } catch (e) {
        console.error('Failed to parse action JSON:', e);
      }
    }
    return { action: undefined, cleanText: text };
  };

  const handleSendMessage = async () => {
    if (!inputMessage.trim() && !attachedImage) return;

    const userMsgId = crypto.randomUUID();
    const userMessage: Message = {
      id: userMsgId,
      role: 'user',
      content: inputMessage,
      image: attachedImage || undefined
    };

    setMessages(prev => [...prev, userMessage]);
    setInputMessage('');
    setAttachedImage(null);
    setIsLoading(true);

    try {
      // Map message history to send to server
      const chatHistory = messages.map(m => ({
        role: m.role === 'user' ? 'user' : 'assistant',
        content: m.content
      }));

      const response = await fetchApi('/agent/chat', {
        method: 'POST',
        body: JSON.stringify({
          message: userMessage.content,
          history: chatHistory,
          image: userMessage.image
        })
      });

      const { action, cleanText } = parseActionBlock(response.reply || '');

      setMessages(prev => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: 'agent',
          content: cleanText,
          action: action
        }
      ]);
    } catch (err: any) {
      setMessages(prev => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: 'agent',
          content: `${t('error', 'Error')}: ${err.message || 'Strategic link failed'}`
        }
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleActionChange = (msgId: string, field: string, value: any) => {
    setMessages(prev => prev.map(m => {
      if (m.id === msgId && m.action) {
        return {
          ...m,
          action: {
            ...m.action,
            data: {
              ...m.action.data,
              [field]: value
            }
          }
        };
      }
      return m;
    }));
  };

  const handleCommitAction = async (msgId: string) => {
    const msg = messages.find(m => m.id === msgId);
    if (!msg || !msg.action) return;

    try {
      setMessages(prev => prev.map(m => {
        if (m.id === msgId && m.action) {
          return { ...m, action: { ...m.action, status: 'approved' } };
        }
        return m;
      }));

      const res = await fetchApi('/agent/execute', {
        method: 'POST',
        body: JSON.stringify({
          actionType: msg.action.type,
          data: msg.action.data
        })
      });

      if (res.success) {
        setMessages(prev => [
          ...prev,
          {
            id: crypto.randomUUID(),
            role: 'agent',
            content: `${t('ikike_sync_success', 'Success: Memory synced and saved to database.')}`
          }
        ]);
      }
    } catch (err: any) {
      // Revert status
      setMessages(prev => prev.map(m => {
        if (m.id === msgId && m.action) {
          return { ...m, action: { ...m.action, status: 'pending' } };
        }
        return m;
      }));

      alert(`${t('error', 'Error')}: ${err.message || 'Failed to commit action'}`);
    }
  };

  const handleRejectAction = (msgId: string) => {
    setMessages(prev => prev.map(m => {
      if (m.id === msgId && m.action) {
        return {
          ...m,
          action: {
            ...m.action,
            status: 'rejected'
          }
        };
      }
      return m;
    }));
  };

  // Helper to get descriptive labels for fields
  const getFieldLabel = (field: string): string => {
    const labels: Record<string, string> = {
      name: t('item_name', 'Name'),
      category: t('category', 'Category'),
      quantity: t('quantity', 'Quantity'),
      price: t('price', 'Unit Cost'),
      supplier: t('supplier', 'Supplier'),
      location: t('location', 'Location'),
      min_stock: t('min_stock', 'Min Stock'),
      max_stock: t('max_stock', 'Max Stock'),
      plate_number: t('plate_number', 'Plate Number'),
      model: t('model', 'Model'),
      capacity: t('capacity', 'Capacity (Tons)'),
      status: t('status', 'Status'),
      date: t('date', 'Date'),
      truck_id: t('truck', 'Truck ID'),
      driver_name: t('driver', 'Driver Name'),
      granite_type: t('granite_type', 'Granite Type'),
      unit_price: t('unit_price_label', 'Price/Ton'),
      client_name: t('client', 'Client Name'),
      total_amount: t('total_revenue', 'Total Amount'),
      paid_amount: t('paid_amount', 'Paid Amount'),
      due_date: t('due_date', 'Due Date'),
      notes: t('notes', 'Notes'),
      account_id: t('account', 'Account ID'),
      amount: t('amount', 'Amount'),
      type: t('type', 'Type'),
      transaction_date: t('date', 'Date'),
      description: t('description', 'Description'),
      reference: t('reference', 'Reference'),
      balance: t('balance', 'Balance')
    };
    return labels[field] || field;
  };

  return (
    <>
      {/* ── Floating Pulse Button ── */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        title={t('ikike_chat_title')}
        className={[
          'fixed bottom-20 right-6 z-50',
          'flex items-center justify-center w-14 h-14 rounded-full',
          'bg-gradient-to-tr from-slate-900 via-navy to-slate-800',
          'text-amber-400 shadow-[0_0_20px_rgba(245,158,11,0.2)]',
          'border border-amber-500/40 hover:border-amber-400',
          'transition-all duration-300 ease-out hover:scale-110 active:scale-95 hover:shadow-[0_0_25px_rgba(245,158,11,0.45)]',
          isOpen ? 'rotate-90 text-amber-300' : 'animate-pulse'
        ].join(' ')}
      >
        {isOpen ? <X size={24} /> : <Brain size={26} className="animate-spin-slow" />}
      </button>

      {/* ── Chat Widget ── */}
      {isOpen && (
        <div className={[
          'fixed bottom-36 right-6 z-50',
          'w-96 max-w-[calc(100vw-2rem)] h-[600px]',
          'bg-slate-900 border border-slate-700/50 rounded-2xl shadow-2xl',
          'flex flex-col overflow-hidden text-white backdrop-blur-xl',
          'transition-all duration-300 ease-out scale-100 opacity-100 font-sans'
        ].join(' ')}>
          {/* Header */}
          <div className="bg-gradient-to-r from-slate-950 via-navy to-slate-950 p-4 border-b border-slate-800/80 flex items-center justify-between">
            <div className="flex items-center space-x-2.5">
              <div className="p-1.5 bg-amber-500/10 border border-amber-500/20 rounded-lg text-amber-400">
                <Brain size={18} />
              </div>
              <div>
                <h3 className="text-sm font-black tracking-wider text-amber-400 uppercase leading-none">IKIKÉ STRATEGIC AI</h3>
                <span className="text-[10px] text-slate-400 mt-1 block tracking-wider leading-none">Uplink: Active (Guinea Node)</span>
              </div>
            </div>
            <button 
              onClick={() => setIsOpen(false)}
              className="text-slate-400 hover:text-white transition-colors"
            >
              <X size={18} />
            </button>
          </div>

          {/* Messages Area */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-950/40 scrollbar-thin">
            {messages.map((msg) => (
              <div 
                key={msg.id} 
                className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
              >
                <div 
                  className={[
                    'max-w-[85%] rounded-2xl p-3 text-sm leading-relaxed shadow-md',
                    msg.role === 'user' 
                      ? 'bg-navy text-white rounded-tr-none border border-blue-500/20' 
                      : 'bg-slate-800/90 text-slate-100 rounded-tl-none border border-slate-700/50'
                  ].join(' ')}
                >
                  {/* Attached Image Thumbnail */}
                  {msg.image && (
                    <div className="mb-2 rounded-lg overflow-hidden border border-slate-700 max-h-32">
                      <img src={msg.image} alt="Uploaded" className="w-full object-cover" />
                    </div>
                  )}
                  
                  {/* Content text */}
                  <p className="whitespace-pre-wrap">{msg.content}</p>

                  {/* Verification action card */}
                  {msg.action && msg.action.status === 'pending' && (
                    <div className="mt-3 p-3 bg-slate-900 border border-amber-500/30 rounded-xl space-y-2">
                      <div className="flex items-center space-x-1.5 text-xs text-amber-400 font-bold uppercase tracking-wider">
                        <Sparkles size={13} />
                        <span>{t('ikike_propose_title')}</span>
                      </div>
                      <p className="text-xs text-slate-300 italic">{msg.action.summary}</p>
                      
                      {/* Dynamic form fields */}
                      <div className="space-y-1.5 pt-1 border-t border-slate-800 max-h-40 overflow-y-auto">
                        {Object.entries(msg.action.data).map(([field, val]) => (
                          <div key={field} className="flex flex-col space-y-0.5">
                            <label className="text-[10px] text-slate-400 uppercase font-semibold">{getFieldLabel(field)}</label>
                            <input
                              type="text"
                              value={val as string || ''}
                              onChange={(e) => handleActionChange(msg.id, field, e.target.value)}
                              className="w-full bg-slate-950 border border-slate-800 focus:border-amber-500/50 rounded-md px-2 py-1 text-xs text-white focus:outline-none"
                            />
                          </div>
                        ))}
                      </div>

                      {/* Control buttons */}
                      <div className="flex items-center justify-end space-x-2 pt-2 border-t border-slate-800">
                        <button
                          onClick={() => handleRejectAction(msg.id)}
                          className="px-2.5 py-1 text-[11px] font-bold text-slate-400 hover:text-white bg-slate-950 border border-slate-800 hover:border-slate-700 rounded-md transition"
                        >
                          {t('ikike_reject', 'Reject')}
                        </button>
                        <button
                          onClick={() => handleCommitAction(msg.id)}
                          className="flex items-center space-x-1 px-3 py-1 text-[11px] font-bold text-slate-950 bg-amber-500 hover:bg-amber-400 rounded-md transition shadow-md"
                        >
                          <Check size={12} />
                          <span>{t('ikike_approve', 'Approve & Commit')}</span>
                        </button>
                      </div>
                    </div>
                  )}

                  {msg.action && msg.action.status === 'approved' && (
                    <div className="mt-2.5 p-2 bg-emerald-950/40 border border-emerald-500/20 text-emerald-400 text-xs rounded-xl flex items-center space-x-1.5">
                      <CheckCircle2 size={14} />
                      <span className="font-semibold">{t('action_approved', 'Action Approved & Committed')}</span>
                    </div>
                  )}

                  {msg.action && msg.action.status === 'rejected' && (
                    <div className="mt-2.5 p-2 bg-rose-950/40 border border-rose-500/20 text-rose-400 text-xs rounded-xl flex items-center space-x-1.5">
                      <AlertCircle size={14} />
                      <span className="font-semibold">{t('action_rejected', 'Action Proposal Rejected')}</span>
                    </div>
                  )}
                </div>
              </div>
            ))}

            {isLoading && (
              <div className="flex items-center space-x-2 text-slate-400 text-xs pl-2 bg-slate-850/50 py-2 rounded-xl">
                <Loader2 size={14} className="animate-spin text-amber-500" />
                <span className="animate-pulse">Ikiké is formulating a strategic response...</span>
              </div>
            )}
            
            <div ref={messagesEndRef} />
          </div>

          {/* Form input field container */}
          <div className="p-3 bg-slate-950 border-t border-slate-800 flex flex-col space-y-2">
            {/* Attachment preview */}
            {attachedImage && (
              <div className="relative inline-block w-16 h-16 rounded-lg overflow-hidden border border-slate-700 shadow-md">
                <img src={attachedImage} alt="Attachment preview" className="w-full h-full object-cover" />
                <button
                  onClick={() => setAttachedImage(null)}
                  className="absolute top-0 right-0 p-0.5 bg-slate-950/80 hover:bg-slate-950 text-white rounded-bl-lg transition-all"
                >
                  <X size={10} />
                </button>
              </div>
            )}

            <div className="flex items-center space-x-2">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                title={t('ikike_upload_docs')}
                className="p-2 text-slate-400 hover:text-white bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-xl transition"
              >
                <Paperclip size={18} />
              </button>
              
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleImageUpload}
                accept="image/*"
                className="hidden"
              />

              <input
                type="text"
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                placeholder={t('ikike_chat_placeholder', 'Ask Ikiké to manage tasks...')}
                className="flex-1 bg-slate-900 border border-slate-800 focus:border-amber-500/50 focus:outline-none rounded-xl px-3 py-2 text-sm text-white placeholder-slate-500"
              />

              <button
                onClick={handleSendMessage}
                disabled={!inputMessage.trim() && !attachedImage}
                className="p-2 bg-amber-500 hover:bg-amber-400 text-slate-950 disabled:opacity-50 disabled:hover:bg-amber-500 rounded-xl transition shadow-md"
              >
                <Send size={18} />
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
