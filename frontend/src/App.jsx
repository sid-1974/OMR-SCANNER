import React, { useState } from 'react';
import { Camera, CheckSquare, Settings, BarChart2 } from 'lucide-react';
import OMRScanConsole from './components/OMRScanConsole';
import OMRAnswerKeyConsole from './components/OMRAnswerKeyConsole';
import OMRTemplateDesigner from './components/OMRTemplateDesigner';
import OMRResultsDashboard from './components/OMRResultsDashboard';

function App() {
  const [activeTab, setActiveTab] = useState('scan'); // scan | key | designer | results

  return (
    <div className="app-container">
      
      {/* Premium Navigation Header */}
      <nav className="navbar">
        <div className="nav-logo">
          <Camera size={26} style={{ color: 'var(--accent-secondary)' }} />
          <span>OMR Scan Suite</span>
        </div>
        
        <div className="nav-links">
          <button 
            className={`nav-link ${activeTab === 'scan' ? 'active' : ''}`}
            onClick={() => setActiveTab('scan')}
          >
            Scan Console
          </button>
          <button 
            className={`nav-link ${activeTab === 'key' ? 'active' : ''}`}
            onClick={() => setActiveTab('key')}
          >
            Answer Keys
          </button>
          <button 
            className={`nav-link ${activeTab === 'designer' ? 'active' : ''}`}
            onClick={() => setActiveTab('designer')}
          >
            Template Designer
          </button>
          <button 
            className={`nav-link ${activeTab === 'results' ? 'active' : ''}`}
            onClick={() => setActiveTab('results')}
          >
            Results Dashboard
          </button>
        </div>
      </nav>

      {/* Main Content Area */}
      <main className="main-content">
        <div style={{ display: activeTab === 'scan' ? 'block' : 'none' }}>
          <OMRScanConsole onEvaluationComplete={() => setActiveTab('results')} />
        </div>
        
        <div style={{ display: activeTab === 'key' ? 'block' : 'none' }}>
          <OMRAnswerKeyConsole />
        </div>
        
        <div style={{ display: activeTab === 'designer' ? 'block' : 'none' }}>
          <OMRTemplateDesigner onTemplateSaved={() => {}} />
        </div>
        
        <div style={{ display: activeTab === 'results' ? 'block' : 'none' }}>
          <OMRResultsDashboard />
        </div>
      </main>

      {/* Premium Footer */}
      <footer style={{ 
        textAlign: 'center', 
        padding: '1.5rem', 
        borderTop: '1px solid var(--border-color)', 
        color: 'var(--text-muted)',
        fontSize: '0.8rem',
        marginTop: 'auto'
      }}>
        &copy; {new Date().getFullYear()} OMR Scan Suite. Pure Code Computer Vision System. No AI dependencies.
      </footer>

    </div>
  );
}

export default App;
