import React, { useState, useEffect } from 'react';
import { FileText, Download, BarChart2, CheckCircle, AlertTriangle, HelpCircle, Eye } from 'lucide-react';
import { api, API_BASE } from '../api/api';
import SearchableDropdown from './SearchableDropdown';

const OMRResultsDashboard = () => {

  const [templates, setTemplates] = useState([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [resultsData, setResultsData] = useState(null);
  
  // Pagination & Filters
  const [availableQpCodes, setAvailableQpCodes] = useState([]);
  const [selectedQpCode, setSelectedQpCode] = useState('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  
  // Modal for detailed student view
  const [viewingStudent, setViewingStudent] = useState(null);

  useEffect(() => {
    fetchTemplates();
  }, []);

  const fetchTemplates = async () => {
    try {
      const data = await api.getTemplates();
      if (data.success) {
        setTemplates(data.templates);
        if (data.templates.length > 0) {
          setSelectedTemplateId(data.templates[0].id.toString());
        }
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    if (selectedTemplateId) {
      fetchQpCodes(selectedTemplateId);
    }
  }, [selectedTemplateId]);

  useEffect(() => {
    if (!selectedTemplateId) return;
    fetchEvaluationResults(selectedTemplateId, page, limit, selectedQpCode);
  }, [selectedTemplateId, page, limit, selectedQpCode]);

  const fetchQpCodes = async (templateId) => {
    try {
      const data = await api.getQpCodes(templateId);
      if (data.success) {
        setAvailableQpCodes(data.qpcodes || []);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const fetchEvaluationResults = async (templateId, p, l, qpc) => {
    setLoading(true);
    setError('');
    try {
      const data = await api.compare(templateId, p, l, qpc);
      if (data.success) {
        setResultsData(data);
        if (data.pagination) {
          setTotalCount(data.pagination.total);
          setTotalPages(data.pagination.total_pages);
        }
      } else {
        setResultsData(null);
        setError(data.message || 'No evaluation results found.');
      }
    } catch (err) {
      setError('Network error fetching results.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // Export Results Table to CSV
  const handleExportCSV = async () => {
    try {
      // Fetch all data for export, ignoring pagination
      const data = await api.compare(selectedTemplateId, 1, 100000, selectedQpCode);
      if (data.success && data.results.length > 0) {
        let csvContent = "data:text/csv;charset=utf-8,";
        csvContent += "Student Reg No,OMR Sheet Number,Pattern,QP Code,Total Questions,Correct,Wrong,Blank,Score\r\n";
        
        data.results.forEach(row => {
          csvContent += `${row.student_regno},${row.sheet_number},${row.pattern || 'A'},${row.qpcode || ''},${row.total_questions},${row.correct_answers},${row.wrong_answers},${row.blank_answers},${row.score}\r\n`;
        });
        
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", `OMR_Evaluation_Results_Template_${selectedTemplateId}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }
    } catch (err) {
      alert("Error exporting: " + err.message);
    }
  };

  // Calculate statistics
  const getStats = () => {
    if (!resultsData || resultsData.results.length === 0) return null;
    
    const list = resultsData.results;
    const count = list.length;
    const scores = list.map(r => parseFloat(r.score));
    
    const maxScore = Math.max(...scores);
    const minScore = Math.min(...scores);
    const avgScore = (scores.reduce((a, b) => a + b, 0) / count).toFixed(2);
    
    // Pass count (assume 40% is pass threshold)
    const passThreshold = list[0].total_questions * 0.4;
    const passCount = list.filter(r => r.score >= passThreshold).length;
    const passPercentage = ((passCount / count) * 100).toFixed(1);

    return {
      count,
      maxScore,
      minScore,
      avgScore,
      passPercentage
    };
  };

  const stats = getStats();

  const selectedTemplate = templates.find(t => t.id && t.id.toString() === selectedTemplateId);
  const isQpCodeTemplate = selectedTemplate && selectedTemplate.qpcode;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      
      {/* Selection & Export Banner */}
      <div className="glass-card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <label className="form-label" style={{ marginBottom: 0, whiteSpace: 'nowrap' }}>OMR Template:</label>
            <SearchableDropdown
              options={templates.map(t => ({ label: t.name, value: t.id.toString() }))}
              value={selectedTemplateId}
              onChange={(val) => {
                setSelectedTemplateId(val);
                setPage(1);
                setSelectedQpCode('');
              }}
              placeholder="-- Select Template --"
              style={{ width: '250px' }}
            />
          </div>
          
          {isQpCodeTemplate && availableQpCodes.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <label className="form-label" style={{ marginBottom: 0, whiteSpace: 'nowrap' }}>QP Code:</label>
              <SearchableDropdown
                options={[{ label: "All Codes", value: "" }, ...availableQpCodes]}
                value={selectedQpCode}
                onChange={(val) => {
                  setSelectedQpCode(val);
                  setPage(1);
                }}
                placeholder="All Codes"
                style={{ width: '150px' }}
              />
            </div>
          )}
        </div>

        {resultsData && resultsData.results.length > 0 && (
          <button className="btn btn-primary" onClick={handleExportCSV}>
            <Download size={16} /> Export to CSV
          </button>
        )}
      </div>

      {/* Loading & Error States */}
      {loading && (
        <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>
          <div className="pulse" style={{ display: 'inline-block', width: '20px', height: '20px', background: 'var(--accent-primary)', borderRadius: '50%' }}></div>
          <p style={{ marginTop: '1rem' }}>Calculating scores and generating stats...</p>
        </div>
      )}

      {error && (
        <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem', padding: '3rem', textAlign: 'center' }}>
          <AlertTriangle size={48} style={{ color: 'var(--warning)' }} />
          <h3 style={{ fontSize: '1.2rem', fontWeight: 600 }}>{error}</h3>
          <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', maxWidth: '400px' }}>
            Ensure student responses have been approved and saved, and that you have created an answer key for this template.
          </p>
        </div>
      )}

      {/* Stats Cards Row */}
      {resultsData && stats && (
        <div className="grid-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
          
          <div className="glass-card" style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <div style={{ background: 'rgba(99, 102, 241, 0.1)', color: 'var(--accent-primary)', padding: '0.75rem', borderRadius: '12px' }}>
              <FileText size={24} />
            </div>
            <div>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 500 }}>Sheets Evaluated</p>
              <h3 style={{ fontSize: '1.5rem', fontWeight: 800 }}>{stats.count}</h3>
            </div>
          </div>

          <div className="glass-card" style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <div style={{ background: 'rgba(16, 185, 129, 0.1)', color: 'var(--success)', padding: '0.75rem', borderRadius: '12px' }}>
              <BarChart2 size={24} />
            </div>
            <div>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 500 }}>Average Score</p>
              <h3 style={{ fontSize: '1.5rem', fontWeight: 800 }}>{stats.avgScore}</h3>
            </div>
          </div>

          <div className="glass-card" style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <div style={{ background: 'rgba(6, 182, 212, 0.1)', color: 'var(--accent-secondary)', padding: '0.75rem', borderRadius: '12px' }}>
              <CheckCircle size={24} />
            </div>
            <div>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 500 }}>Highest / Lowest</p>
              <h3 style={{ fontSize: '1.4rem', fontWeight: 800 }}>{stats.maxScore} / {stats.minScore}</h3>
            </div>
          </div>

          <div className="glass-card" style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <div style={{ background: 'rgba(245, 158, 11, 0.1)', color: 'var(--warning)', padding: '0.75rem', borderRadius: '12px' }}>
              <CheckCircle size={24} />
            </div>
            <div>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 500 }}>Pass Rate (&ge;40%)</p>
              <h3 style={{ fontSize: '1.5rem', fontWeight: 800 }}>{stats.passPercentage}%</h3>
            </div>
          </div>

        </div>
      )}

      {/* Main Results Table */}
      {resultsData && resultsData.results.length > 0 && (
        <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 700 }}>Evaluated Students List</h3>
            {resultsData.results[0]?.evaluated_at && (
              <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                Evaluated at: {new Date(resultsData.results[0].evaluated_at).toLocaleDateString('en-GB')} {new Date(resultsData.results[0].evaluated_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}
              </span>
            )}
          </div>
          
          <div style={{ overflowX: 'auto' }}>
            <table className="custom-table">
              <thead>
                <tr>
                  <th>Student Reg No</th>
                  <th>OMR ID</th>
                  <th>Pattern</th>
                  <th>Total Questions</th>
                  <th style={{ color: 'var(--success)' }}>Correct</th>
                  <th style={{ color: 'var(--danger)' }}>Wrong</th>
                  <th style={{ color: 'var(--text-muted)' }}>Blank</th>
                  <th>Score</th>
                  <th style={{ width: '100px' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {resultsData.results.map((row) => (
                  <tr key={row.scanned_sheet_id}>
                    <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{row.student_regno}</td>
                    <td>{row.sheet_number}</td>
                    <td>
                      <span className="badge badge-primary">{row.pattern || 'A'}</span>
                    </td>
                    <td>{row.total_questions}</td>
                    <td style={{ color: 'var(--success)', fontWeight: 600 }}>{row.correct_answers}</td>
                    <td style={{ color: 'var(--danger)' }}>{row.wrong_answers}</td>
                    <td style={{ color: 'var(--text-muted)' }}>{row.blank_answers}</td>
                    <td style={{ fontWeight: 700, fontSize: '1.05rem', color: 'var(--accent-secondary)' }}>
                      {row.score} <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 500 }}>/ {row.total_questions}</span>
                    </td>
                    <td>
                      <button 
                        className="btn btn-secondary" 
                        style={{ padding: '6px 12px', fontSize: '0.75rem' }}
                        onClick={() => setViewingStudent(row)}
                      >
                        <Eye size={12} /> Compare
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          
          {/* Pagination Controls */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem', borderTop: '1px solid var(--border-color)', flexWrap: 'wrap', gap: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Rows per page:</span>
              <SearchableDropdown
                options={[
                  { label: "10", value: 10 },
                  { label: "20", value: 20 },
                  { label: "50", value: 50 },
                  { label: "100", value: 100 },
                  { label: "All", value: 10000 }
                ]}
                value={limit}
                onChange={(val) => {
                  setLimit(Number(val));
                  setPage(1);
                }}
                style={{ width: '100px', fontSize: '0.85rem' }}
                className="form-input"
              />
            </div>
            
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                Showing {totalCount === 0 ? 0 : (page - 1) * limit + 1} to {Math.min(page * limit, totalCount)} of {totalCount}
              </span>
              <div style={{ display: 'flex', gap: '0.25rem' }}>
                <button 
                  className="btn btn-secondary" 
                  style={{ padding: '4px 10px', fontSize: '0.85rem' }}
                  disabled={page <= 1 || loading}
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                >
                  Prev
                </button>
                <button 
                  className="btn btn-secondary" 
                  style={{ padding: '4px 10px', fontSize: '0.85rem' }}
                  disabled={page >= totalPages || loading}
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                >
                  Next
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Detail Comparison Modal (Drawer Overlay) */}
      {viewingStudent && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100vw',
          height: '100vh',
          background: 'rgba(0,0,0,0.85)',
          display: 'flex',
          justifyContent: 'flex-end',
          zIndex: 1000,
          backdropFilter: 'blur(4px)'
        }}>
          
          <div style={{
            width: '1100px',
            maxWidth: '95vw',
            background: 'var(--bg-secondary)',
            height: '100%',
            boxShadow: '-10px 0 40px rgba(0,0,0,0.5)',
            borderLeft: '1px solid var(--border-color)',
            display: 'grid',
            gridTemplateColumns: '450px 1fr',
            gap: '2rem',
            padding: '2rem'
          }}>
            
            {/* Left: Aligned or Raw OMR Sheet Visual Reference */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', borderRight: '1px solid var(--border-color)', paddingRight: '1.5rem', height: '100%', overflowY: 'auto' }}>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 700 }}>Student Sheet Reference</h3>
              <div style={{ border: '1px solid var(--border-color)', borderRadius: '8px', overflow: 'hidden', background: '#090b11', padding: '0.5rem' }}>
                {(viewingStudent.aligned_image_path || viewingStudent.raw_image_path) ? (
                  <img 
                    src={`${API_BASE}/${viewingStudent.aligned_image_path || viewingStudent.raw_image_path}`} 
                    alt="Student OMR Sheet" 
                    style={{ width: '100%', height: 'auto', display: 'block', borderRadius: '4px' }} 
                    onError={(e) => {
                      // If the path fails, fallback to raw path just in case
                      e.target.src = `${API_BASE}/${viewingStudent.raw_image_path}`;
                    }}
                  />
                ) : (
                  <div style={{ padding: '3rem 1rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                    No image available.
                  </div>
                )}
              </div>
            </div>

            {/* Right: Detailed Table Comparison */}
            <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
              
              {/* Modal Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)', paddingBottom: '1rem', marginBottom: '1.5rem' }}>
                <div>
                  <h3 style={{ fontSize: '1.25rem', fontWeight: 700 }}>Comparison Grid</h3>
                   <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                     RegNo: {viewingStudent.student_regno} | OMR ID: {viewingStudent.sheet_number} | Pattern: <span className="badge badge-primary">{viewingStudent.pattern || 'A'}</span>
                   </p>
                </div>
                <button 
                  className="btn btn-secondary"
                  style={{ padding: '4px 10px' }}
                  onClick={() => setViewingStudent(null)}
                >
                  Close
                </button>
              </div>

              {/* Score Stats Inside Modal */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', marginBottom: '1.5rem', textAlign: 'center' }}>
                <div style={{ background: 'var(--bg-primary)', padding: '0.5rem', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Correct</span>
                  <h4 style={{ color: 'var(--success)', fontWeight: 700 }}>{viewingStudent.correct_answers}</h4>
                </div>
                <div style={{ background: 'var(--bg-primary)', padding: '0.5rem', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Incorrect</span>
                  <h4 style={{ color: 'var(--danger)', fontWeight: 700 }}>{viewingStudent.wrong_answers}</h4>
                </div>
                <div style={{ background: 'var(--bg-primary)', padding: '0.5rem', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Score</span>
                  <h4 style={{ color: 'var(--accent-secondary)', fontWeight: 700 }}>{viewingStudent.score} / {viewingStudent.total_questions}</h4>
                </div>
              </div>

              {/* Details Scrolling Grid */}
              <div style={{ flex: 1, overflowY: 'auto', border: '1px solid var(--border-color)', borderRadius: '8px' }}>
                <table className="custom-table">
                  <thead>
                    <tr>
                      <th>Qn#</th>
                      <th>Answer Key</th>
                      <th>Student Selected</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {viewingStudent.comparison_matrix.map(q => (
                      <tr key={q.question_number} style={{ background: q.is_correct ? 'transparent' : 'rgba(239, 68, 68, 0.03)' }}>
                        <td style={{ fontWeight: 600 }}>Q{q.question_number}</td>
                        <td>
                          <span style={{ 
                            width: '24px', 
                            height: '24px', 
                            borderRadius: '50%', 
                            background: 'rgba(255,255,255,0.05)', 
                            display: 'inline-flex', 
                            alignItems: 'center', 
                            justifyContent: 'center', 
                            fontSize: '11px',
                            fontWeight: 700 
                          }}>
                            {q.correct_option}
                          </span>
                        </td>
                        <td>
                          <span style={{ 
                            width: '24px', 
                            height: '24px', 
                            borderRadius: '50%', 
                            background: q.is_correct ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                            color: q.is_correct ? 'var(--success)' : 'var(--danger)', 
                            display: 'inline-flex', 
                            alignItems: 'center', 
                            justifyContent: 'center', 
                            fontSize: '11px',
                            fontWeight: 700 
                          }}>
                            {q.selected_option}
                          </span>
                        </td>
                        <td>
                          {q.is_correct ? (
                            <span className="badge badge-success">Correct</span>
                          ) : (
                            <span className="badge badge-danger">
                              {q.selected_option === 'BLANK' ? 'Blank' : 'Wrong'}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

            </div>

          </div>

        </div>
      )}

    </div>
  );
};

export default OMRResultsDashboard;
