import { useState, useEffect, useRef, useCallback } from 'react';
import api from '../../utils/api';

// ─── AI Extraction via Backend Proxy (Keeps API Key Secure on Server) ───────
async function extractTextWithAI(userMessage) {
  const res = await api.post('/activation-requests/ai-extract-text', { text: userMessage });
  return res.data?.data || {};
}

async function extractImageWithAI(base64Image, mimeType) {
  const res = await api.post('/activation-requests/ai-extract-image', { base64Image, mimeType });
  return res.data?.data || {};
}

// ─── Helper: file → base64 ────────────────────────────────────────────────────
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ─── Step-by-step fallback fields ────────────────────────────────────────────
const FORM_STEPS = [
  { key: '__imei__',         label: 'IMEI number bolo ya type karo (15 digits)',   transform: t=>t.replace(/\D/g,'').slice(0,15),               validate: v=>v.length===15?null:'IMEI 15 digit ka hona chahiye' },
  { key: 'vehicleNo',        label: 'Vehicle number bolo (jaise MH12AB1234)',       transform: t=>t.replace(/\s+/g,'').toUpperCase(),             validate: v=>v.length>=6?null:'Valid vehicle number bolo' },
  { key: 'vehicleMake',      label: 'Vehicle ka make bolo (jaise Tata, Mahindra)',  transform: t=>t.trim(),                                       validate: v=>v.length>=2?null:'Vehicle make bolo' },
  { key: 'vehicleModel',     label: 'Vehicle ka model bolo (jaise Ace, Bolero)',    transform: t=>t.trim(),                                       validate: v=>v.length>=1?null:'Vehicle model bolo' },
  { key: 'registrationYear', label: 'Registration year bolo (jaise 2022)',          transform: t=>{ const m=t.match(/\b(19|20)\d{2}\b/); return m?m[0]:t.replace(/\D/g,'').slice(0,4); }, validate: v=>/^\d{4}$/.test(v)?null:'4 digit year bolo' },
  { key: 'chassisNo',        label: 'Chassis number bolo',                          transform: t=>t.replace(/\s+/g,'').toUpperCase(),             validate: v=>v.length>=5?null:'Chassis number bolo' },
  { key: 'engineNo',         label: 'Engine number bolo',                           transform: t=>t.replace(/\s+/g,'').toUpperCase(),             validate: v=>v.length>=5?null:'Engine number bolo' },
  { key: 'customerName',     label: 'Customer ka poora naam bolo',                  transform: t=>t.trim().replace(/\s+/g,' '),                   validate: v=>v.length>=3?null:'Customer naam bolo' },
  { key: 'regMobNo',         label: 'Customer ka 10 digit mobile number bolo',      transform: t=>t.replace(/\D/g,'').slice(0,10),                validate: v=>/^\d{10}$/.test(v)?null:'10 digit mobile chahiye' },
  { key: 'aadharNo',         label: 'Aadhar number bolo (12 digit)',                transform: t=>t.replace(/\D/g,'').slice(0,12),                validate: v=>/^\d{12}$/.test(v)?null:'12 digit Aadhar chahiye' },
  { key: 'address',          label: 'Customer ka address bolo',                     transform: t=>t.trim().replace(/\s+/g,' '),                   validate: v=>v.length>=5?null:'Address bolo' },
];

const isSpeechSupported = () =>
  typeof window !== 'undefined' && ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window);

const FILLABLE_KEYS = ['vehicleNo','vehicleMake','vehicleModel','registrationYear',
                       'chassisNo','engineNo','customerName','regMobNo','aadharNo',
                       'address','rto','iccid','serialNo'];

// ─── Main Component ───────────────────────────────────────────────────────────
const AIFormFiller = ({ formData, setFormData, onSelectDevice, onClose }) => {
  const [mode, setMode]                     = useState('ai');      // 'ai' | 'step'
  const [messages, setMessages]             = useState([]);
  const [currentStepIdx, setCurrentStepIdx] = useState(0);
  const [inputText, setInputText]           = useState('');
  const [isListening, setIsListening]       = useState(false);
  const [aiStatus, setAiStatus]             = useState('idle');    // idle|listening|processing|done
  const [lang, setLang]                     = useState('hi-IN');
  const [interimText, setInterimText]       = useState('');
  const [errorMsg, setErrorMsg]             = useState('');
  const [deviceFound, setDeviceFound]       = useState(false);

  // Image state
  const [imageFile, setImageFile]           = useState(null);
  const [imagePreview, setImagePreview]     = useState(null);
  const [imageProcessing, setImageProcessing] = useState(false);

  const recognitionRef = useRef(null);
  const chatEndRef     = useRef(null);
  const imageInputRef  = useRef(null);

  const isDone = mode === 'step'
    ? currentStepIdx >= FORM_STEPS.length
    : aiStatus === 'done';

  const progressPercent = isDone ? 100
    : mode === 'ai' ? (deviceFound ? 70 : 10)
    : Math.round((currentStepIdx / FORM_STEPS.length) * 100);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, interimText]);

  // Greeting
  useEffect(() => {
    addAIMessage(
      '🙏 Namaste! Main Groq AI Form Assistant hun.\n\n' +
      '📸 **Image Mode:** RC Book / Document ki photo upload karo → sab auto-fill!\n\n' +
      '✨ **Text/Voice Mode:** Ek hi baar mein sab bolo:\n"Rahul Kumar, MH12AB1234, chassis MAT123, engine ENG456, IMEI 865670123456789"\n\n' +
      '→ Neeche 📷 camera button dabao ya type/mic use karo!'
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Speech Recognition ────────────────────────────────────────────────────
  const setupRecognition = useCallback(() => {
    if (!isSpeechSupported()) return null;
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const rec = new SR();
    rec.lang = lang; rec.continuous = false; rec.interimResults = true; rec.maxAlternatives = 3;
    rec.onstart  = () => { setIsListening(true); setAiStatus('listening'); setInterimText(''); setErrorMsg(''); };
    rec.onresult = (e) => {
      let interim = '', final = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) final += t; else interim += t;
      }
      setInterimText(interim);
      if (final) { setInterimText(''); setInputText(final.trim()); }
    };
    rec.onerror = (e) => {
      setIsListening(false); setAiStatus('idle'); setInterimText('');
      if (e.error === 'no-speech') setErrorMsg('Kuch suna nahi. Dobara try karo.');
      else if (e.error === 'not-allowed') setErrorMsg('❌ Mic permission nahi mili. Browser mein allow karo.');
      else setErrorMsg(`Voice error: ${e.error}`);
    };
    rec.onend = () => { setIsListening(false); setAiStatus('idle'); setInterimText(''); };
    return rec;
  }, [lang]);

  const startListening = () => {
    if (!isSpeechSupported()) { setErrorMsg('❌ Chrome/Edge use karo voice ke liye.'); return; }
    if (isListening) return;
    recognitionRef.current = setupRecognition();
    try { recognitionRef.current.start(); } catch { setErrorMsg('Voice start nahi hua. Try again.'); }
  };
  const stopListening = () => {
    try { recognitionRef.current?.stop(); } catch {/* */}
    setIsListening(false); setInterimText('');
  };

  const addAIMessage  = (text) => setMessages(p => [...p, { role: 'ai',   text }]);
  const addUserMessage = (text) => setMessages(p => [...p, { role: 'user', text }]);

  // ── IMEI lookup ───────────────────────────────────────────────────────────
  const lookupIMEI = async (imei) => {
    const res = await api.get(`/devices?search=${imei}&limit=5`);
    const devices = res.data?.devices || res.data?.data || res.data || [];
    return Array.isArray(devices) ? (devices.find(d => d.imei === imei) || devices[0]) : null;
  };

  // ── Apply extracted JSON to form ──────────────────────────────────────────
  const applyExtracted = async (extracted, sourceLabel) => {
    // IMEI lookup
    const imei = (extracted.imei || '').replace(/\D/g, '').slice(0, 15);
    let device = null;
    if (imei.length === 15) {
      addAIMessage(`🔍 IMEI ${imei} search kar raha hun...`);
      try {
        device = await lookupIMEI(imei);
        if (device) { onSelectDevice(device); setDeviceFound(true); }
      } catch (e) { console.error('IMEI lookup:', e); }
    }

    // Fill other fields
    const updates = {};
    const filled  = [];
    for (const key of FILLABLE_KEYS) {
      if (extracted[key] && extracted[key].trim()) {
        updates[key] = extracted[key].trim();
        filled.push(key);
      }
    }
    if (Object.keys(updates).length > 0) setFormData(prev => ({ ...prev, ...updates }));

    // Summary
    const lines = [];
    if (device)                      lines.push(`✅ Device: ${device.imei}`);
    else if (imei.length === 15)     lines.push(`⚠️ IMEI ${imei} inventory mein nahi mila`);
    if (extracted.customerName)      lines.push(`👤 Customer: ${extracted.customerName}`);
    if (extracted.vehicleNo)         lines.push(`🚗 Vehicle No: ${extracted.vehicleNo}`);
    if (extracted.vehicleMake)       lines.push(`🏭 Make: ${extracted.vehicleMake}`);
    if (extracted.vehicleModel)      lines.push(`📋 Model: ${extracted.vehicleModel}`);
    if (extracted.registrationYear)  lines.push(`📅 Year: ${extracted.registrationYear}`);
    if (extracted.chassisNo)         lines.push(`🔩 Chassis: ${extracted.chassisNo}`);
    if (extracted.engineNo)          lines.push(`⚙️ Engine: ${extracted.engineNo}`);
    if (extracted.regMobNo)          lines.push(`📱 Mobile: ${extracted.regMobNo}`);
    if (extracted.aadharNo)          lines.push(`🪪 Aadhar: ${extracted.aadharNo}`);
    if (extracted.address)           lines.push(`📍 Address: ${extracted.address.slice(0, 60)}...`);
    if (extracted.rto)               lines.push(`🏢 RTO: ${extracted.rto}`);

    const mandatory = ['vehicleNo','vehicleMake','vehicleModel','registrationYear',
                       'chassisNo','engineNo','customerName','regMobNo','aadharNo','address'];
    const missing = mandatory.filter(k => !extracted[k] || !extracted[k].trim());

    if (lines.length > 0) {
      addAIMessage(
        `✅ ${sourceLabel} se ${lines.length} fields fill hue:\n\n${lines.join('\n')}` +
        (missing.length > 0
          ? `\n\n⚠️ Abhi bhi missing:\n${missing.map(m => `• ${m}`).join('\n')}\n\nInhe manually fill karo ya dobara bolo.`
          : '\n\n🎉 Sab fill ho gaya! Submit dabao! ✅')
      );
      if (missing.length === 0) setAiStatus('done');
    } else {
      addAIMessage('⚠️ Kuch extract nahi hua. Dobara try karo ya manually fill karo.');
    }
    setAiStatus(prev => prev === 'processing' ? 'idle' : prev);
  };

  // ── Image Upload Handler ──────────────────────────────────────────────────
  const handleImageChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate
    if (!file.type.startsWith('image/')) {
      setErrorMsg('❌ Sirf image files allowed hain (JPG, PNG, WEBP)');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setErrorMsg('❌ Image 10MB se chhoti honi chahiye');
      return;
    }

    setErrorMsg('');
    setImageFile(file);
    const previewUrl = URL.createObjectURL(file);
    setImagePreview(previewUrl);
    addUserMessage(`📷 Image upload ki: ${file.name}`);
    addAIMessage(`📸 Image mil gayi! Groq Vision AI se data extract kar raha hun...\n⏳ Please wait...`);
    setImageProcessing(true);
    setAiStatus('processing');

    try {
      const base64 = await fileToBase64(file);
      const extracted = await extractImageWithAI(base64, file.type);
      await applyExtracted(extracted, '📸 Image');
    } catch (err) {
      console.error('Vision error:', err);
      addAIMessage(`❌ Image read nahi ho saka: ${err.response?.data?.message || err.message}\n\nManually type karo ya dobara try karo.`);
      setAiStatus('idle');
    } finally {
      setImageProcessing(false);
      // Reset file input so same file can be re-uploaded
      if (imageInputRef.current) imageInputRef.current.value = '';
    }
  };

  // ── AI Text Mode ──────────────────────────────────────────────────────────
  const handleAIMode = async (raw) => {
    setAiStatus('processing');
    addAIMessage('🤖 Groq AI process kar raha hai...');
    try {
      const extracted = await extractTextWithAI(raw);
      await applyExtracted(extracted, '🎤 Voice/Text');
    } catch (err) {
      console.error('Groq text error:', err);
      addAIMessage(`⚠️ AI error: ${err.response?.data?.message || err.message}\n\nStep-by-step mode pe switch kar raha hun...`);
      setMode('step');
      setAiStatus('idle');
      addAIMessage(FORM_STEPS[0].label);
    }
  };

  // ── Step Mode ─────────────────────────────────────────────────────────────
  const handleStepMode = async (raw) => {
    const step  = FORM_STEPS[currentStepIdx];
    const value = step.transform(raw);
    setAiStatus('processing');
    const validErr = step.validate(value);
    if (validErr) {
      setAiStatus('idle');
      addAIMessage(`⚠️ ${validErr}\n\n${step.label}`);
      return;
    }
    if (step.key === '__imei__') {
      addAIMessage(`🔍 IMEI ${value} search kar raha hun...`);
      try {
        const device = await lookupIMEI(value);
        if (!device) {
          setAiStatus('idle');
          addAIMessage(`❌ IMEI ${value} inventory mein nahi mila. Sahi IMEI dobara bolo.`);
          return;
        }
        onSelectDevice(device); setDeviceFound(true); setAiStatus('idle');
        const info = [device.imei && `IMEI: ${device.imei}`, device.serialNo && `Serial: ${device.serialNo}`, device.vendor && `Vendor: ${device.vendor}`].filter(Boolean).join('\n');
        addAIMessage(`✅ Device mila!\n\n${info}\n\nDevice fields auto-fill! Ab vehicle details:`);
        setTimeout(() => { setCurrentStepIdx(1); addAIMessage(FORM_STEPS[1].label); }, 900);
      } catch {
        setAiStatus('idle');
        addAIMessage('❌ Server se connect nahi hua. Try again.');
      }
      return;
    }
    setFormData(prev => ({ ...prev, [step.key]: value }));
    setAiStatus('idle');
    const nextIdx = currentStepIdx + 1;
    if (nextIdx >= FORM_STEPS.length) {
      addAIMessage('🎉 Sab fill ho gaye! Submit button dabao! ✅');
      setAiStatus('done');
      setCurrentStepIdx(FORM_STEPS.length);
    } else {
      setCurrentStepIdx(nextIdx);
      addAIMessage(`✔️ Got it!\n\n${FORM_STEPS[nextIdx].label}`);
    }
  };

  // ── Submit ────────────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    const raw = inputText.trim();
    if (!raw) return;
    setInputText(''); stopListening(); addUserMessage(raw);
    if (mode === 'ai') await handleAIMode(raw);
    else await handleStepMode(raw);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit(); }
  };

  const handleReset = () => {
    setMessages([]); setCurrentStepIdx(0); setInputText(''); setInterimText('');
    setAiStatus('idle'); setDeviceFound(false); setErrorMsg('');
    setImageFile(null); setImagePreview(null); setImageProcessing(false);
    setTimeout(() => addAIMessage('🔄 Reset! Image upload karo ya text/voice se bolo.'), 100);
  };

  const currentStep = mode === 'step' && !isDone ? FORM_STEPS[currentStepIdx] : null;

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div style={{
      background: 'linear-gradient(135deg, #1e1b4b 0%, #312e81 100%)',
      borderRadius: '12px', marginBottom: '16px', overflow: 'hidden',
      boxShadow: '0 4px 20px rgba(109,40,217,0.35)', border: '1px solid #4c1d95',
    }}>
      {/* ── Header ── */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'10px 14px', background:'rgba(0,0,0,0.25)', borderBottom:'1px solid rgba(255,255,255,0.1)' }}>
        <div style={{ display:'flex', alignItems:'center', gap:'8px' }}>
          <span style={{ fontSize:'18px' }}>🤖</span>
          <div>
            <div style={{ fontSize:'13px', fontWeight:'800', color:'#c4b5fd' }}>
              AI Smart Form Filler
              {GROQ_API_KEY && <span style={{ marginLeft:'6px', fontSize:'9px', background:'#10b981', color:'#fff', padding:'2px 6px', borderRadius:'10px', fontWeight:'700' }}>GROQ ⚡</span>}
            </div>
            <div style={{ fontSize:'10px', color:'#a78bfa' }}>
              {isDone ? '✅ Form ready — Submit dabao!'
                : mode==='ai' ? '📸 Image / 🎤 Voice / ⌨️ Text'
                : `Step ${currentStepIdx+1}/${FORM_STEPS.length}`}
            </div>
          </div>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:'5px' }}>
          {GROQ_API_KEY && (
            <button type="button"
              onClick={() => { setMode(m => m==='ai'?'step':'ai'); setMessages([]); setTimeout(()=>addAIMessage(mode==='ai'?'Step-by-step mode. IMEI pehle bolo.':'AI mode. Sab ek saath bolo ya image upload karo!'),100); }}
              style={{ padding:'4px 8px', borderRadius:'6px', border:'1px solid rgba(167,139,250,0.4)', background:'rgba(109,40,217,0.4)', color:'#c4b5fd', fontSize:'10px', fontWeight:'700', cursor:'pointer' }}>
              {mode==='ai'?'🤖 AI':'📝 Step'}
            </button>
          )}
          <button type="button" onClick={()=>setLang(l=>l==='hi-IN'?'en-IN':'hi-IN')}
            style={{ padding:'4px 8px', borderRadius:'6px', border:'1px solid rgba(167,139,250,0.4)', background:'rgba(109,40,217,0.4)', color:'#c4b5fd', fontSize:'10px', fontWeight:'700', cursor:'pointer' }}>
            {lang==='hi-IN'?'🇮🇳 HI':'🇬🇧 EN'}
          </button>
          <button type="button" onClick={handleReset}
            style={{ padding:'4px 8px', borderRadius:'6px', border:'1px solid rgba(167,139,250,0.4)', background:'rgba(109,40,217,0.4)', color:'#c4b5fd', fontSize:'10px', fontWeight:'700', cursor:'pointer' }}>
            🔄
          </button>
          <button type="button" onClick={onClose}
            style={{ padding:'4px 8px', borderRadius:'6px', border:'1px solid rgba(239,68,68,0.4)', background:'rgba(239,68,68,0.2)', color:'#fca5a5', fontSize:'11px', fontWeight:'700', cursor:'pointer' }}>
            ✕
          </button>
        </div>
      </div>

      {/* ── Progress Bar ── */}
      <div style={{ background:'rgba(0,0,0,0.2)', padding:'7px 14px 5px' }}>
        <div style={{ display:'flex', justifyContent:'space-between', marginBottom:'3px' }}>
          <span style={{ fontSize:'10px', color:'#a78bfa', fontWeight:'600' }}>
            {isDone ? '✅ Complete!' : imageProcessing ? '📸 Image scan ho rahi hai...' : mode==='ai' ? 'AI Mode Active' : `Field: ${currentStep?.key||'done'}`}
          </span>
          <span style={{ fontSize:'10px', color:'#a78bfa', fontWeight:'700' }}>{progressPercent}%</span>
        </div>
        <div style={{ background:'rgba(255,255,255,0.1)', borderRadius:'10px', height:'5px', overflow:'hidden' }}>
          <div style={{ height:'100%', width:`${progressPercent}%`, background: isDone?'#10b981':'linear-gradient(90deg,#8b5cf6,#6d28d9)', borderRadius:'10px', transition:'width 0.4s ease' }}/>
        </div>
      </div>

      {/* ── Image Preview (if uploaded) ── */}
      {imagePreview && (
        <div style={{ padding:'8px 14px 0', display:'flex', gap:'10px', alignItems:'flex-start' }}>
          <div style={{ position:'relative' }}>
            <img src={imagePreview} alt="Uploaded document" style={{ width:'80px', height:'80px', objectFit:'cover', borderRadius:'8px', border:'2px solid rgba(167,139,250,0.5)' }}/>
            {imageProcessing && (
              <div style={{ position:'absolute', inset:0, background:'rgba(0,0,0,0.6)', borderRadius:'8px', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'20px' }}>
                ⏳
              </div>
            )}
          </div>
          <div style={{ fontSize:'11px', color:'#a78bfa' }}>
            <div style={{ fontWeight:'700', marginBottom:'2px' }}>{imageFile?.name}</div>
            <div>{imageProcessing ? '🔍 AI scan kar raha hai...' : '✅ Processed'}</div>
            <button type="button" onClick={() => { setImageFile(null); setImagePreview(null); }}
              style={{ marginTop:'4px', fontSize:'10px', color:'#fca5a5', background:'none', border:'none', cursor:'pointer', textDecoration:'underline' }}>
              Remove
            </button>
          </div>
        </div>
      )}

      {/* ── Chat Window ── */}
      <div style={{ maxHeight:'200px', overflowY:'auto', padding:'10px 14px', display:'flex', flexDirection:'column', gap:'8px', scrollbarWidth:'thin', scrollbarColor:'#4c1d95 transparent' }}>
        {messages.map((msg, i) => (
          <div key={i} style={{ display:'flex', justifyContent:msg.role==='user'?'flex-end':'flex-start' }}>
            <div style={{
              maxWidth:'88%', padding:'8px 12px',
              borderRadius: msg.role==='user'?'12px 12px 2px 12px':'12px 12px 12px 2px',
              background: msg.role==='user'?'linear-gradient(135deg,#7c3aed,#6d28d9)':'rgba(255,255,255,0.08)',
              border: msg.role==='user'?'none':'1px solid rgba(255,255,255,0.1)',
              fontSize:'12px', color:msg.role==='user'?'#fff':'#e0e7ff',
              whiteSpace:'pre-line', lineHeight:'1.55',
            }}>
              {msg.role==='ai' && <span style={{ fontSize:'10px', color:'#a78bfa', fontWeight:'700', display:'block', marginBottom:'2px' }}>🤖 Groq AI</span>}
              {msg.text}
            </div>
          </div>
        ))}
        {interimText && (
          <div style={{ display:'flex', justifyContent:'flex-end' }}>
            <div style={{ maxWidth:'88%', padding:'6px 10px', borderRadius:'10px 10px 2px 10px', background:'rgba(109,40,217,0.3)', border:'1px dashed rgba(167,139,250,0.5)', fontSize:'12px', color:'#c4b5fd', fontStyle:'italic' }}>
              🎤 {interimText}...
            </div>
          </div>
        )}
        {(aiStatus==='processing' || imageProcessing) && (
          <div style={{ display:'flex', justifyContent:'flex-start' }}>
            <div style={{ padding:'8px 14px', borderRadius:'12px 12px 12px 2px', background:'rgba(255,255,255,0.06)', border:'1px solid rgba(255,255,255,0.1)', fontSize:'12px', color:'#a78bfa' }}>
              ⏳ {imageProcessing?'Image scan ho rahi hai...':'Processing...'}
            </div>
          </div>
        )}
        <div ref={chatEndRef}/>
      </div>

      {/* ── Error ── */}
      {errorMsg && (
        <div style={{ margin:'0 14px 8px', padding:'7px 10px', background:'rgba(239,68,68,0.15)', border:'1px solid rgba(239,68,68,0.3)', borderRadius:'8px', fontSize:'11px', color:'#fca5a5' }}>
          {errorMsg}
        </div>
      )}

      {/* ── Input Area ── */}
      {!isDone && (
        <div style={{ padding:'10px 14px 12px', borderTop:'1px solid rgba(255,255,255,0.08)' }}>

          {/* Image upload button — prominent row */}
          {GROQ_API_KEY && mode==='ai' && (
            <div style={{ marginBottom:'8px' }}>
              <input ref={imageInputRef} type="file" accept="image/*" capture="environment"
                onChange={handleImageChange} style={{ display:'none' }} id="ai-image-upload"/>
              <label htmlFor="ai-image-upload" style={{
                display:'flex', alignItems:'center', justifyContent:'center', gap:'8px',
                padding:'10px', borderRadius:'10px',
                border:'2px dashed rgba(167,139,250,0.5)',
                background: imageProcessing?'rgba(109,40,217,0.15)':'rgba(109,40,217,0.08)',
                color:'#c4b5fd', fontSize:'12px', fontWeight:'700',
                cursor: imageProcessing?'not-allowed':'pointer',
                transition:'all 0.2s',
              }}>
                <span style={{ fontSize:'20px' }}>📷</span>
                {imageProcessing
                  ? '⏳ AI scan kar raha hai...'
                  : '📸 RC Book / Document / Form ki Photo Upload Karo → AI Auto-Fill Karega!'}
              </label>
            </div>
          )}

          {/* Text + mic + send row */}
          <div style={{ display:'flex', gap:'8px', alignItems:'center' }}>
            <input
              type="text"
              value={inputText}
              onChange={e => setInputText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={
                mode==='ai'
                  ? 'Ya type karo: "Rahul Kumar, MH12AB1234, IMEI 865670..."'
                  : (currentStep?.key==='__imei__'?'Type IMEI (15 digits)...':'Type karo ya mic dabao...')
              }
              disabled={aiStatus==='processing' || imageProcessing}
              style={{ flex:1, padding:'9px 12px', borderRadius:'8px', border:'1px solid rgba(167,139,250,0.3)', background:'rgba(255,255,255,0.07)', color:'#e0e7ff', fontSize:'12px', outline:'none', fontFamily:'inherit' }}
            />
            {isSpeechSupported() && (
              <button type="button"
                onMouseDown={startListening} onMouseUp={stopListening}
                onTouchStart={startListening} onTouchEnd={stopListening}
                disabled={aiStatus==='processing' || imageProcessing}
                title="Dabao aur bolo"
                style={{
                  width:'38px', height:'38px', borderRadius:'50%', border:'none', flexShrink:0,
                  background: isListening?'linear-gradient(135deg,#ef4444,#dc2626)':'linear-gradient(135deg,#7c3aed,#6d28d9)',
                  color:'#fff', fontSize:'16px', cursor:'pointer',
                  display:'flex', alignItems:'center', justifyContent:'center',
                  boxShadow: isListening?'0 0 0 4px rgba(239,68,68,0.3)':'0 2px 8px rgba(109,40,217,0.5)',
                  animation: isListening?'aipulse 1s infinite':'none',
                }}>
                {isListening ? '🔴' : '🎤'}
              </button>
            )}
            <button type="button" onClick={handleSubmit}
              disabled={!inputText.trim() || aiStatus==='processing' || imageProcessing}
              style={{
                padding:'9px 14px', borderRadius:'8px', border:'none', flexShrink:0,
                background: inputText.trim()&&aiStatus!=='processing'&&!imageProcessing
                  ?'linear-gradient(135deg,#7c3aed,#6d28d9)':'rgba(255,255,255,0.08)',
                color: inputText.trim()&&aiStatus!=='processing'&&!imageProcessing?'#fff':'#6b7280',
                fontSize:'12px', fontWeight:'700', cursor:'pointer', transition:'all 0.2s',
              }}>
              ↩ Send
            </button>
          </div>
        </div>
      )}

      {/* ── Done ── */}
      {isDone && (
        <div style={{ padding:'12px 14px', textAlign:'center', borderTop:'1px solid rgba(255,255,255,0.08)' }}>
          <div style={{ fontSize:'13px', color:'#6ee7b7', fontWeight:'700', marginBottom:'4px' }}>
            🎉 Form bilkul ready hai!
          </div>
          <div style={{ fontSize:'11px', color:'#a78bfa' }}>
            Neeche Submit button dabao ✅&nbsp;|&nbsp;
            <span style={{ cursor:'pointer', textDecoration:'underline', color:'#c4b5fd' }} onClick={handleReset}>
              Dobara karna hai?
            </span>
          </div>
        </div>
      )}

      <style>{`
        @keyframes aipulse {
          0%   { box-shadow: 0 0 0 0   rgba(239,68,68,0.6); }
          70%  { box-shadow: 0 0 0 8px rgba(239,68,68,0);   }
          100% { box-shadow: 0 0 0 0   rgba(239,68,68,0);   }
        }
      `}</style>
    </div>
  );
};

export default AIFormFiller;
