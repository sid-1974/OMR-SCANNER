import React, { useState, useRef, useEffect } from 'react';
import { RefreshCw, Check, AlertCircle } from 'lucide-react';
import { detectAnchors, warpPerspective } from '../utils/omrScanner';

const OMRImageAdjuster = ({ file, template, onAligned }) => {
  const [loading, setLoading] = useState(false);
  const [detecting, setDetecting] = useState(false);
  const [anchors, setAnchors] = useState({
    topLeft: { x: 50, y: 50 },
    topRight: { x: 550, y: 50 },
    bottomLeft: { x: 50, y: 750 },
    bottomRight: { x: 550, y: 750 }
  });
  
  const [autoDetected, setAutoDetected] = useState(false);
  const [originalDimensions, setOriginalDimensions] = useState({ width: 600, height: 800 });
  const [imageObj, setImageObj] = useState(null);
  
  const containerRef = useRef(null);
  const rawCanvasRef = useRef(null);
  const warpedCanvasRef = useRef(null);

  // Load the uploaded scan image
  useEffect(() => {
    if (!file) return;

    setLoading(true);
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = async () => {
        setImageObj(img);
        
        // Calculate display size (bound width to 600px for editing UI)
        const maxWidth = 600;
        const scale = img.width > maxWidth ? maxWidth / img.width : 1;
        const dispW = Math.round(img.width * scale);
        const dispH = Math.round(img.height * scale);
        
        setOriginalDimensions({ width: dispW, height: dispH });
        
        // Draw to raw canvas
        const canvas = rawCanvasRef.current;
        canvas.width = dispW;
        canvas.height = dispH;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, dispW, dispH);

        // Run auto-anchor detection using template guidance
        setDetecting(true);
        try {
          const detected = await detectAnchors(canvas, template);
          setAnchors({
            topLeft: detected.topLeft,
            topRight: detected.topRight,
            bottomLeft: detected.bottomLeft,
            bottomRight: detected.bottomRight
          });
          setAutoDetected(detected.autoDetected);
        } catch (err) {
          console.error("Auto anchor detection failed", err);
        } finally {
          setDetecting(false);
          setLoading(false);
        }
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  }, [file]);

  // Re-run perspective warp when anchors change
  useEffect(() => {
    if (!imageObj) return;

    const performWarp = async () => {
      const rawCanvas = rawCanvasRef.current;
      const warpedCanvas = warpedCanvasRef.current;
      if (!rawCanvas || !warpedCanvas) return;

      // Ensure warped canvas matches template standard dimensions
      const targetW = template.width || 800;
      const targetH = template.height || 1100;
      warpedCanvas.width = targetW;
      warpedCanvas.height = targetH;

      // Extract raw template anchor config
      let templateAnchors = template.anchors_json;
      if (typeof templateAnchors === 'string') {
        templateAnchors = JSON.parse(templateAnchors);
      }

      const targetConfig = {
        width: targetW,
        height: targetH,
        anchors: templateAnchors
      };

      try {
        await warpPerspective(rawCanvas, warpedCanvas, anchors, targetConfig);
      } catch (err) {
        console.error("Perspective transformation failed", err);
      }
    };

    // Debounce warping slightly to ensure smooth dragging performance
    const timer = setTimeout(performWarp, 30);
    return () => clearTimeout(timer);
  }, [anchors, imageObj, template]);

  // Handle Dragging
  const handlePinDragStart = (e, cornerName) => {
    e.preventDefault();
    const container = containerRef.current;
    if (!container) return;

    const handleMouseMove = (moveEvent) => {
      const rect = container.getBoundingClientRect();
      // Bound the coordinates within raw image canvas limits
      const x = Math.max(0, Math.min(originalDimensions.width, Math.round(moveEvent.clientX - rect.left)));
      const y = Math.max(0, Math.min(originalDimensions.height, Math.round(moveEvent.clientY - rect.top)));
      
      setAnchors(prev => ({
        ...prev,
        [cornerName]: { x, y }
      }));
      setAutoDetected(false); // Manually adjusted
    };

    const handleMouseUp = () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  const handleConfirm = async () => {
    if (!imageObj) return;
    setLoading(true);

    try {
      // Reconstruct the scale factor used during initialization
      const maxWidth = 600;
      const scale = imageObj.width > maxWidth ? maxWidth / imageObj.width : 1;

      // Scale anchors back to the original full-resolution image coordinates
      const fullResAnchors = {
        topLeft: { x: anchors.topLeft.x / scale, y: anchors.topLeft.y / scale },
        topRight: { x: anchors.topRight.x / scale, y: anchors.topRight.y / scale },
        bottomLeft: { x: anchors.bottomLeft.x / scale, y: anchors.bottomLeft.y / scale },
        bottomRight: { x: anchors.bottomRight.x / scale, y: anchors.bottomRight.y / scale }
      };

      // Create a temporary full-resolution raw canvas
      const fullRawCanvas = document.createElement('canvas');
      fullRawCanvas.width = imageObj.width;
      fullRawCanvas.height = imageObj.height;
      const rawCtx = fullRawCanvas.getContext('2d');
      rawCtx.drawImage(imageObj, 0, 0);

      // Create the final high-quality warped canvas
      const fullWarpedCanvas = document.createElement('canvas');
      const targetW = template.width || 800;
      const targetH = template.height || 1100;
      fullWarpedCanvas.width = targetW;
      fullWarpedCanvas.height = targetH;

      let templateAnchors = template.anchors_json;
      if (typeof templateAnchors === 'string') {
        templateAnchors = JSON.parse(templateAnchors);
      }

      await warpPerspective(fullRawCanvas, fullWarpedCanvas, fullResAnchors, {
        width: targetW,
        height: targetH,
        anchors: templateAnchors
      });

      fullWarpedCanvas.toBlob((blob) => {
        onAligned({
          blob: blob,
          dataUrl: fullWarpedCanvas.toDataURL('image/jpeg', 0.95),
          anchors: fullResAnchors
        });
        setLoading(false);
      }, 'image/jpeg', 0.95);

    } catch (err) {
      console.error("Full resolution warp failed", err);
      setLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', width: '100%' }}>
      
      {/* Top Banner Status */}
      <div style={{ 
        background: autoDetected ? 'var(--success-glow)' : 'var(--warning-glow)',
        border: `1px solid ${autoDetected ? 'rgba(16, 185, 129, 0.2)' : 'rgba(245, 158, 11, 0.2)'}`,
        padding: '1rem',
        borderRadius: '8px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        fontSize: '0.9rem'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <AlertCircle style={{ color: autoDetected ? 'var(--success)' : 'var(--warning)' }} />
          <span>
            {detecting ? 'Analyzing image and detecting corner anchors...' : 
             autoDetected ? 'Corner anchors detected automatically!' : 
             'Align the paper: Drag the 4 pins to the corners of the sheet.'}
          </span>
        </div>
        
        {!detecting && (
          <button 
            className="btn btn-secondary" 
            style={{ padding: '4px 8px', fontSize: '0.8rem' }}
            onClick={async () => {
              setDetecting(true);
              const detected = await detectAnchors(rawCanvasRef.current, template);
              setAnchors(detected);
              setAutoDetected(detected.autoDetected);
              setDetecting(false);
            }}
          >
            <RefreshCw size={14} className={detecting ? 'pulse' : ''} /> Reset Detection
          </button>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
        
        {/* Left: Original + Interactive Drag Pins */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-secondary)' }}>1. Scanned Sheet (Original)</h3>
          
          <div 
            ref={containerRef} 
            style={{ 
              position: 'relative', 
              width: `${originalDimensions.width}px`, 
              height: `${originalDimensions.height}px`,
              border: '1px solid var(--border-color)',
              borderRadius: '8px',
              overflow: 'hidden',
              background: '#000'
            }}
          >
            <canvas ref={rawCanvasRef} style={{ display: 'block' }} />
            
            {/* Draggable Pins */}
            {!loading && Object.keys(anchors).map((key) => {
              const pt = anchors[key];
              const label = key === 'topLeft' ? 'TL' : key === 'topRight' ? 'TR' : key === 'bottomLeft' ? 'BL' : 'BR';
              return (
                <div 
                  key={key}
                  className="anchor-pin"
                  style={{ left: pt.x, top: pt.y }}
                  onMouseDown={(e) => handlePinDragStart(e, key)}
                  onTouchStart={(e) => {
                    const touch = e.touches[0];
                    handlePinDragStart({
                      preventDefault: () => {},
                      clientX: touch.clientX,
                      clientY: touch.clientY
                    }, key);
                  }}
                >
                  {label}
                </div>
              );
            })}
          </div>
        </div>

        {/* Right: Aligned Warped Preview */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-secondary)' }}>2. Aligned Preview (800x1100 Normalized)</h3>
          
          <div style={{ 
            width: `${originalDimensions.width}px`, 
            height: `${originalDimensions.height}px`, 
            border: '1px solid var(--border-color)',
            borderRadius: '8px',
            overflow: 'hidden',
            background: '#090b11',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <div style={{ 
              transform: `scale(${originalDimensions.width / 800})`, 
              transformOrigin: 'center center',
              width: '800px',
              height: '1100px'
            }}>
              <canvas ref={warpedCanvasRef} style={{ boxShadow: '0 8px 24px rgba(0,0,0,0.4)', background: '#fff' }} />
            </div>
          </div>
        </div>

      </div>

      {/* Confirmation Actions */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginTop: '1rem' }}>
        <button 
          className="btn btn-success" 
          onClick={handleConfirm}
          disabled={loading || detecting}
          style={{ padding: '0.75rem 2rem' }}
        >
          <Check size={18} /> Confirm Alignment & Scan Bubbles
        </button>
      </div>

    </div>
  );
};

export default OMRImageAdjuster;
