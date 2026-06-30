const fs = require('fs');
const path = 'c:/Users/siddu/OneDrive/Desktop/omr/frontend/src/components/OMRTemplateDesigner.jsx';

let code = fs.readFileSync(path, 'utf8');

// 1. Replace top state vars
code = code.replace(/const \[templateName, setTemplateName\][\s\S]*?const \[availableQpCodesForName, setAvailableQpCodesForName\] = useState\(\[\]\);/,
`  // Parents (Templates)
  const [parents, setParents] = useState([]);
  const [selectedParentId, setSelectedParentId] = useState('');
  const [isCreatingNewParent, setIsCreatingNewParent] = useState(false);
  const [newParentName, setNewParentName] = useState('');

  // Children (QPCodes/Designs)
  const [qpcodes, setQpcodes] = useState([]);
  const [isCreatingNewQpCode, setIsCreatingNewQpCode] = useState(false);
  const [newQpCodeValue, setNewQpCodeValue] = useState('');

  const [imageSrc, setImageSrc] = useState(null);
  const [imageDimensions, setImageDimensions] = useState({ width: 800, height: 1100 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');`);

// 2. Replace editingTemplateId and related effects
code = code.replace(/const \[editingTemplateId, setEditingTemplateId\] = useState\(null\);[\s\S]*?\}\, \[templateName\, templateQpCodes\, templates\]\);/,
`const [editingTemplateId, setEditingTemplateId] = useState(null);
  const [isDragging, setIsDragging] = useState(false);

  // Bulk generator states
  const [genTotalQ, setGenTotalQ] = useState(100);
  const [genRowsPerBlock, setGenRowsPerBlock] = useState(20);
  const [genColsPerBlock, setGenColsPerBlock] = useState(1);
  const [genOptions, setGenOptions] = useState('A,B,C,D');
  const [genStartQ, setGenStartQ] = useState(1);

  useEffect(() => {
    fetchParents();
  }, []);

  const fetchParents = async () => {
    try {
      const res = await api.getTemplates();
      if (res.success) {
        setParents(res.parents || []);
      }
    } catch (err) {
      console.error('Failed to load parents', err);
    }
  };

  useEffect(() => {
    if (selectedParentId && !isCreatingNewParent) {
      fetchQpCodes(selectedParentId);
    } else {
      setQpcodes([]);
    }
  }, [selectedParentId, isCreatingNewParent]);

  const fetchQpCodes = async (parentId) => {
    try {
      const res = await api.getTemplates(null, parentId);
      if (res.success) {
        setQpcodes(res.qpcodes || []);
      }
    } catch (err) {
      console.error('Failed to load qpcodes', err);
    }
  };

  const loadImageFromUrl = (url) => {
    const img = new Image();
    img.onload = () => {
      setImageObj(img);
      setImageSrc(url);
    };
    img.src = url;
  };`);

// 3. Update handleClearAll
code = code.replace(/const handleClearAll = \(\) => \{[\s\S]*?setTemplateQpCodes\(''\);/,
`const handleClearAll = () => {
    setEditingTemplateId(null);
    setSelectedParentId('');
    setIsCreatingNewParent(false);
    setNewParentName('');
    setQpcodes([]);
    setIsCreatingNewQpCode(false);
    setNewQpCodeValue('');`);

// 4. Update handleSelectTemplate first part
code = code.replace(/setEditingTemplateId\(t\.id\);\s*setTemplateName\(t\.name\);\s*setTemplateQpCodes\(t\.qpcode \|\| ''\);/, 
`setEditingTemplateId(t.id);`);

// 5. Update handleSaveTemplate
code = code.replace(/const handleSaveTemplate = async \(\) => \{[\s\S]*?const resData = await api\.saveTemplate\(formData\);/m,
`const handleSaveTemplate = async () => {
    if (!imageSrc || !imageObj) {
      setError('Please upload a blank OMR sheet image first.');
      return;
    }

    const finalParentName = isCreatingNewParent ? newParentName : parents.find(p => p.id == selectedParentId)?.name;
    if (!finalParentName?.trim()) {
      setError('Please provide a template name.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      // Get the image file blob from the file input
      const file = fileInputRef.current?.files?.[0];
      if (!file && !editingTemplateId) {
        setError('Blank OMR sheet image file not found. Please upload it.');
        setLoading(false);
        return;
      }

      const formData = new FormData();
      if (!isCreatingNewQpCode && editingTemplateId) {
        formData.append('id', editingTemplateId);
      }
      formData.append('name', finalParentName.trim());
      formData.append('width', imageDimensions.width);
      formData.append('height', imageDimensions.height);
      if (file) {
        formData.append('blank_image', file);
      }

      formData.append('anchors_json', JSON.stringify(anchors));
      formData.append('regno_config', regNoConfig.enabled ? JSON.stringify(regNoConfig) : 'null');
      formData.append('sheetno_config', sheetNoConfig.enabled ? JSON.stringify(sheetNoConfig) : 'null');
      
      const finalQpCode = isCreatingNewQpCode ? newQpCodeValue : qpcodes.find(q => q.id == editingTemplateId)?.qpcode;
      if (finalQpCode) {
        formData.append('qpcode', finalQpCode.trim());
      }
      formData.append('qpcode_config', qpcodeConfig.enabled ? JSON.stringify(qpcodeConfig) : 'null');

      // Calculate bubble coordinates and bundle into questions config
      const questionsData = questionBlocks.map(block => ({
        ...block,
        bubbles: getQuestionBlockBubbles(block)
      }));
      formData.append('questions_config', JSON.stringify(questionsData));

      const resData = await api.saveTemplate(formData);`);

code = code.replace(/if \(resData\.success\) \{[\s\S]*?alert\(resData\.message/m,
`if (resData.success) {
        setEditingTemplateId(resData.template_id);
        
        // Refresh parents and QPCodes list
        await fetchParents();
        if (resData.parent_id) {
            setSelectedParentId(resData.parent_id);
            setIsCreatingNewParent(false);
            await fetchQpCodes(resData.parent_id);
        }
        setIsCreatingNewQpCode(false);

        setError('');
        if (onTemplateSaved) {
          onTemplateSaved();
        }
        alert(resData.message`);

// 6. Update UI
code = code.replace(/\{editingTemplateId && \([\s\S]*?<\/datalist>\n        <\/div>/m,
`{editingTemplateId && !isCreatingNewQpCode && (
          <div style={{ marginBottom: '1rem', padding: '0.5rem 1rem', background: 'rgba(16, 185, 129, 0.1)', border: '1px solid var(--success)', borderRadius: '8px', color: 'var(--success)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span><CheckCircle size={14} style={{ display: 'inline', marginRight: '4px' }} /> Editing Existing Design ID: {editingTemplateId}</span>
            <button onClick={handleClearAll} style={{ background: 'none', border: 'none', color: 'var(--success)', cursor: 'pointer', textDecoration: 'underline', fontSize: '0.8rem' }}>Clear All</button>
          </div>
        )}
        {(!editingTemplateId || isCreatingNewQpCode) && (
          <div style={{ marginBottom: '1rem', padding: '0.5rem 1rem', background: 'rgba(59, 130, 246, 0.1)', border: '1px solid var(--accent-primary)', borderRadius: '8px', color: 'var(--accent-primary)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span><Edit size={14} style={{ display: 'inline', marginRight: '4px' }} /> Creating New Design Variation</span>
            <button onClick={handleClearAll} style={{ background: 'none', border: 'none', color: 'var(--accent-primary)', cursor: 'pointer', textDecoration: 'underline', fontSize: '0.8rem' }}>Clear All</button>
          </div>
        )}

        {/* Template Group Selection */}
        <div className="form-group" style={{ marginBottom: '1.5rem' }}>
          <label className="form-label" style={{ fontWeight: 600, display: 'flex', justifyContent: 'space-between' }}>
            Template Group
            {!isCreatingNewParent && (
              <button 
                onClick={() => { setIsCreatingNewParent(true); setSelectedParentId(''); setQpcodes([]); setIsCreatingNewQpCode(true); setEditingTemplateId(null); }} 
                style={{ background: 'none', border: 'none', color: 'var(--accent-primary)', cursor: 'pointer', fontSize: '0.8rem', display: 'flex', alignItems: 'center' }}
              >
                <Plus size={12} style={{ marginRight: '2px' }}/> New Template
              </button>
            )}
            {isCreatingNewParent && (
              <button 
                onClick={() => setIsCreatingNewParent(false)} 
                style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '0.8rem' }}
              >
                Cancel
              </button>
            )}
          </label>

          {isCreatingNewParent ? (
            <input
              type="text"
              className="form-input"
              value={newParentName}
              onChange={(e) => setNewParentName(e.target.value)}
              placeholder="Enter new template name (e.g. JSS College)"
            />
          ) : (
            <select
              className="form-input"
              value={selectedParentId}
              onChange={(e) => {
                setSelectedParentId(e.target.value);
                setEditingTemplateId(null);
                setIsCreatingNewQpCode(false);
              }}
            >
              <option value="">-- Select Template Group --</option>
              {parents.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          )}
        </div>

        {/* QP Code / Design Selection */}
        {(selectedParentId || isCreatingNewParent) && (
          <div className="form-group" style={{ marginBottom: '1.5rem' }}>
            <label className="form-label" style={{ fontWeight: 600, display: 'flex', justifyContent: 'space-between' }}>
              QP Code (Design)
              {!isCreatingNewQpCode && (
                <button 
                  onClick={() => { setIsCreatingNewQpCode(true); setEditingTemplateId(null); }} 
                  style={{ background: 'none', border: 'none', color: 'var(--accent-primary)', cursor: 'pointer', fontSize: '0.8rem', display: 'flex', alignItems: 'center' }}
                >
                  <Plus size={12} style={{ marginRight: '2px' }}/> New QPCode
                </button>
              )}
              {isCreatingNewQpCode && selectedParentId && (
                <button 
                  onClick={() => setIsCreatingNewQpCode(false)} 
                  style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '0.8rem' }}
                >
                  Cancel
                </button>
              )}
            </label>

            {isCreatingNewQpCode ? (
              <input
                type="text"
                className="form-input"
                value={newQpCodeValue}
                onChange={(e) => setNewQpCodeValue(e.target.value)}
                placeholder="Enter new QP Code (e.g. 101)"
              />
            ) : (
              <select
                className="form-input"
                value={editingTemplateId || ''}
                onChange={(e) => {
                  setEditingTemplateId(e.target.value);
                  if (e.target.value) handleSelectTemplate(e.target.value);
                }}
              >
                <option value="">-- Select QP Code --</option>
                {qpcodes.map(q => (
                  <option key={q.id} value={q.id}>{q.qpcode || 'Design #' + q.id}</option>
                ))}
              </select>
            )}
          </div>
        )}`);

fs.writeFileSync(path, code);
console.log("Patched successfully!");
