import React, { useState, useEffect } from 'react';
import { Save, Info, Key, AlertCircle } from 'lucide-react';
import { api } from '../api/api';
import SearchableDropdown from './SearchableDropdown';

const OMRAnswerKeyConsole = () => {

  const [templates, setTemplates] = useState([]);
  const [selectedTemplateName, setSelectedTemplateName] = useState('');
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [selectedQpCode, setSelectedQpCode] = useState('');
  const [selectedPattern, setSelectedPattern] = useState('A');
  const [availableQpCodes, setAvailableQpCodes] = useState([]);
  const [keysList, setKeysList] = useState([]);
  const [selectedQNum, setSelectedQNum] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const uniqueTemplateNames = Array.from(new Set(templates.map(t => t.name))).filter(Boolean);

  useEffect(() => {
    fetchTemplates();
  }, []);

  const fetchTemplates = async () => {
    try {
      const data = await api.getTemplates();
      if (data.success) {
        setTemplates(data.templates);
        if (data.templates.length > 0) {
          const firstUniqueName = Array.from(new Set(data.templates.map(t => t.name))).filter(Boolean)[0];
          setSelectedTemplateName(firstUniqueName);
        }
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    if (!selectedTemplateName) {
      setSelectedTemplate(null);
      setKeysList([]);
      setSelectedQNum(null);
      setAvailableQpCodes([]);
      setSelectedTemplateId('');
      return;
    }

    const matchingTemplates = templates.filter(t => t.name === selectedTemplateName);
    const codes = new Set();
    matchingTemplates.forEach(t => {
      if (t.qpcode) {
        t.qpcode.split(',').forEach(c => codes.add(c.trim()));
      }
    });
    const parsedCodes = Array.from(codes).filter(Boolean);
    setAvailableQpCodes(parsedCodes);
    
    // Automatically select the first QP Code if available and none selected
    if (parsedCodes.length > 0 && !parsedCodes.includes(selectedQpCode)) {
      setSelectedQpCode(parsedCodes[0]);
    } else if (parsedCodes.length === 0) {
      setSelectedQpCode('');
    }
  }, [selectedTemplateName, templates]);

  useEffect(() => {
    if (!selectedTemplateName) return;

    let derivedId = '';
    const matchingTemplates = templates.filter(t => t.name === selectedTemplateName);
    
    if (selectedQpCode) {
      // Find the specific template ID for this Name + QP Code combo
      const exactMatch = matchingTemplates.find(t => t.qpcode && t.qpcode.split(',').map(c => c.trim()).includes(selectedQpCode));
      if (exactMatch) {
        derivedId = exactMatch.id;
      }
    }

    // Fallback to the first matching template if no exact QP code match is found
    if (!derivedId && matchingTemplates.length > 0) {
      derivedId = matchingTemplates[0].id;
    }

    setSelectedTemplateId(derivedId);
  }, [selectedTemplateName, selectedQpCode, templates]);

  useEffect(() => {
    if (selectedTemplateId) {
      fetchTemplateDetails(selectedTemplateId, selectedPattern, selectedQpCode);
    }
  }, [selectedTemplateId, selectedPattern, selectedQpCode]);

  const fetchTemplateDetails = async (id, pattern = 'A', qpcode = '') => {
    setLoading(true);
    try {
      const data = await api.getTemplates(id, null, pattern, qpcode);
      if (data.success) {
        setSelectedTemplate(data.template);

        // Prepare initial keys list
        let qConfig = data.template.questions_config;
        if (typeof qConfig === 'string') qConfig = JSON.parse(qConfig);

        const keysMap = {};
        qConfig.forEach(block => {
          const start = parseInt(block.startQ, 10) || 1;
          const count = parseInt(block.qCount, 10) || 0;
          const end = start + count - 1;
          for (let q = start; q <= end; q++) {
            keysMap[q] = {
              question_number: q,
              correct_option: '', // start empty
              options: block.options || ['A', 'B', 'C', 'D']
            };
          }
        });

        const initialKeys = Object.values(keysMap).sort((a, b) => a.question_number - b.question_number);

        // Overwrite with existing saved keys if present
        if (data.template.answer_key && data.template.answer_key.length > 0) {
          const savedKeysMap = {};
          data.template.answer_key.forEach(k => {
            savedKeysMap[parseInt(k.question_number, 10)] = k.correct_option;
          });

          initialKeys.forEach(k => {
            if (savedKeysMap[k.question_number] !== undefined) {
              k.correct_option = savedKeysMap[k.question_number];
            }
          });
        }

        setKeysList(initialKeys);
        if (initialKeys.length > 0) {
          setSelectedQNum(1);
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // Keyboard navigation & entry listener
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Don't intercept if typing in inputs or textareas or selects
      if (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA' || document.activeElement.tagName === 'SELECT') {
        return;
      }

      if (!selectedTemplate || keysList.length === 0 || !selectedQNum) return;

      const key = e.key.toUpperCase();
      const currentIndex = keysList.findIndex(k => k.question_number === selectedQNum);
      if (currentIndex === -1) return;

      const currentQ = keysList[currentIndex];
      const availableOptions = currentQ.options || ['A', 'B', 'C', 'D'];

      if (availableOptions.includes(key)) {
        handleOptionSelect(selectedQNum, key);
        // Auto-advance
        if (currentIndex < keysList.length - 1) {
          setSelectedQNum(keysList[currentIndex + 1].question_number);
        }
        e.preventDefault();
      } else if (e.key === 'Backspace') {
        handleOptionSelect(selectedQNum, '');
        // Go back
        if (currentIndex > 0) {
          setSelectedQNum(keysList[currentIndex - 1].question_number);
        }
        e.preventDefault();
      } else if (e.key === 'Delete') {
        handleOptionSelect(selectedQNum, '');
        e.preventDefault();
      } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        if (currentIndex < keysList.length - 1) {
          setSelectedQNum(keysList[currentIndex + 1].question_number);
        }
        e.preventDefault();
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        if (currentIndex > 0) {
          setSelectedQNum(keysList[currentIndex - 1].question_number);
        }
        e.preventDefault();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [selectedQNum, keysList, selectedTemplate]);

  // Autoscroll selected question into view
  useEffect(() => {
    if (selectedQNum) {
      const el = document.getElementById(`qcard-${selectedQNum}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }
  }, [selectedQNum]);

  const handleOptionSelect = (qNum, option) => {
    setKeysList(prev => prev.map(k => k.question_number === qNum ? { ...k, correct_option: option } : k));
  };

  const handleClearAllKeys = () => {
    if (confirm("Are you sure you want to clear all answer key selections in the grid?")) {
      setKeysList(prev => prev.map(k => ({ ...k, correct_option: '' })));
    }
  };

  // Save correct keys to PHP backend
  const handleSaveKeys = async () => {
    const unfilledCount = keysList.filter(k => !k.correct_option).length;
    if (unfilledCount > 0) {
      if (!confirm(`Warning: You have ${unfilledCount} questions without a correct answer key selected. Continue saving?`)) {
        return;
      }
    }

    setSaving(true);
    setError('');

    try {
      const data = await api.saveAnswerKey({
        template_id: selectedTemplateId,
        pattern: selectedPattern,
        qpcode: selectedQpCode,
        answers: keysList.filter(k => k.correct_option !== '')
      });

      if (data.success) {
        alert('Answer keys saved successfully!');
        fetchTemplateDetails(selectedTemplateId, selectedPattern, selectedQpCode);
      } else {
        setError(data.message || 'Failed to save answer key.');
      }
    } catch (err) {
      setError('Network error saving keys.');
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>

      {/* Configuration Header Card */}
      <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1.5rem' }}>
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
            <div style={{
              background: 'var(--accent-glow)',
              border: '1px solid rgba(99, 102, 241, 0.2)',
              padding: '0.75rem',
              borderRadius: '12px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <Key size={28} style={{ color: 'var(--accent-secondary)' }} />
            </div>
            <div>
              <h2 style={{ fontSize: '1.5rem', fontWeight: 800, letterSpacing: '-0.025em' }}>Answer Key Configurator</h2>
              <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                Configure correct answers for your OMR templates manually.
              </p>
            </div>
          </div>

          {selectedTemplate && (
            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
              <button
                className="btn btn-secondary"
                onClick={handleClearAllKeys}
                disabled={saving || loading || keysList.filter(k => k.correct_option !== '').length === 0}
              >
                Clear All
              </button>
              <button
                className="btn btn-success"
                onClick={handleSaveKeys}
                disabled={saving || loading}
              >
                <Save size={18} /> {saving ? 'Saving...' : 'Save Answer Key'}
              </button>
            </div>
          )}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.5rem', borderTop: '1px solid var(--border-color)', paddingTop: '1.5rem' }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label" style={{ fontWeight: 600 }}>Select OMR Template</label>
            <SearchableDropdown
              options={uniqueTemplateNames}
              value={selectedTemplateName}
              onChange={setSelectedTemplateName}
              placeholder="-- Choose Template --"
            />
          </div>

          {selectedTemplateName && availableQpCodes.length > 0 && (
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label" style={{ fontWeight: 600 }}>QP Code</label>
              <SearchableDropdown
                options={availableQpCodes}
                value={selectedQpCode}
                onChange={setSelectedQpCode}
                placeholder="Select or enter new QP Code"
                allowCustom={true}
              />
            </div>
          )}

          {selectedTemplate && (
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label" style={{ fontWeight: 600 }}>Exam Paper Pattern</label>
              <SearchableDropdown
                options={[
                  { label: "Pattern A", value: "A" },
                  { label: "Pattern B", value: "B" },
                  { label: "Pattern C", value: "C" },
                  { label: "Pattern D", value: "D" }
                ]}
                value={selectedPattern}
                onChange={setSelectedPattern}
              />
            </div>
          )}

          {selectedTemplate && (
            <div style={{
              background: 'rgba(255, 255, 255, 0.02)',
              border: '1px solid var(--border-color)',
              padding: '1rem',
              borderRadius: '8px',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              gap: '0.25rem'
            }}>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Template Status Summary</span>
              <span style={{ fontSize: '1rem', fontWeight: 700 }}>
                Total Questions: <span style={{ color: 'var(--accent-secondary)' }}>{keysList.length}</span> |
                Configured: <span style={{ color: 'var(--success)' }}>{keysList.filter(k => k.correct_option !== '').length}</span>
              </span>
            </div>
          )}
        </div>

        {selectedTemplate && error && (
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', color: 'var(--danger)', fontSize: '0.875rem', marginTop: '0.5rem' }}>
            <AlertCircle size={16} />
            <span>{error}</span>
          </div>
        )}
      </div>

      {/* Grid view of correct answers */}
      {selectedTemplate && (
        <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)', paddingBottom: '1rem' }}>
            <h3 style={{ fontSize: '1.2rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Info size={18} style={{ color: 'var(--accent-primary)' }} /> Correct Answer Sheet Grid
            </h3>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              Click a card and type A, B, C, or D to set options and auto-advance. Arrows to navigate.
            </span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '1.25rem' }}>
            {keysList.map(k => {
              const isActive = selectedQNum === k.question_number;
              return (
                <div
                  key={k.question_number}
                  id={`qcard-${k.question_number}`}
                  onClick={() => setSelectedQNum(k.question_number)}
                  style={{
                    background: isActive ? 'rgba(99, 102, 241, 0.08)' : (k.correct_option ? 'rgba(99, 102, 241, 0.03)' : 'var(--bg-secondary)'),
                    border: isActive ? '2px solid var(--accent-primary)' : (k.correct_option ? '1px solid rgba(99, 102, 241, 0.2)' : '1px solid var(--border-color)'),
                    boxShadow: isActive ? '0 0 15px var(--accent-glow)' : 'none',
                    transform: isActive ? 'scale(1.02)' : 'scale(1)',
                    padding: '1rem',
                    borderRadius: '10px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.75rem',
                    alignItems: 'center',
                    cursor: 'pointer',
                    transition: 'var(--transition)'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.95rem', fontWeight: 700, color: isActive ? 'var(--accent-primary)' : (k.correct_option ? 'var(--accent-secondary)' : 'var(--text-secondary)') }}>
                      Q{k.question_number}
                    </span>
                    {k.correct_option && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleOptionSelect(k.question_number, '');
                        }}
                        style={{
                          background: 'transparent',
                          border: 0,
                          color: 'var(--text-muted)',
                          fontSize: '10px',
                          cursor: 'pointer',
                          padding: '2px 4px',
                          borderRadius: '4px'
                        }}
                        onMouseOver={(e) => e.currentTarget.style.color = 'var(--danger)'}
                        onMouseOut={(e) => e.currentTarget.style.color = 'var(--text-muted)'}
                      >
                        Clear
                      </button>
                    )}
                  </div>

                  <div style={{ display: 'flex', gap: '6px' }}>
                    {(k.options || ['A', 'B', 'C', 'D']).map(opt => {
                      const isSelected = k.correct_option === opt;
                      return (
                        <button
                          key={opt}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleOptionSelect(k.question_number, opt);
                            setSelectedQNum(k.question_number);
                          }}
                          style={{
                            width: '32px',
                            height: '32px',
                            borderRadius: '50%',
                            border: isSelected ? '2px solid var(--success)' : '1px solid var(--border-color)',
                            background: isSelected ? 'var(--success-glow)' : 'transparent',
                            color: isSelected ? 'var(--success)' : 'var(--text-secondary)',
                            fontSize: '12px',
                            fontWeight: 700,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            transition: 'var(--transition)'
                          }}
                        >
                          {opt}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

    </div>
  );
};

export default OMRAnswerKeyConsole;
