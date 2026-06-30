import React, { useState, useEffect, useRef } from 'react';
import { Play, CheckSquare, FileText, ChevronRight, User, AlertCircle, CheckCircle, Edit, Trash } from 'lucide-react';
import { Html5Qrcode } from 'html5-qrcode';
import OMRImageAdjuster from './OMRImageAdjuster';
import SearchableDropdown from './SearchableDropdown';
import { scanQuestionRow, scanRegistrationGrid, detectAnchors, warpPerspective } from '../utils/omrScanner';
import { api } from '../api/api';

const OMRScanConsole = ({ onEvaluationComplete }) => {

  const [templates, setTemplates] = useState([]);
  const [selectedTemplateName, setSelectedTemplateName] = useState('');
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState(null);

  const [files, setFiles] = useState([]);
  const [processingQueue, setProcessingQueue] = useState([]);
  const [processingIndex, setProcessingIndex] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [scanMode, setScanMode] = useState(null); // 'all' | 'manual'
  const [defaultPattern, setDefaultPattern] = useState('A');
  const [defaultQpCode, setDefaultQpCode] = useState('');
  const [availableQpCodes, setAvailableQpCodes] = useState([]);

  const uniqueTemplateNames = Array.from(new Set(templates.map(t => t.name))).filter(Boolean);

  // Active Manual Alignment state
  const [aligningIndex, setAligningIndex] = useState(null);
  // Active Manual Review/Approval state
  const [reviewingIndex, setReviewingIndex] = useState(null);
  const [reviewData, setReviewData] = useState(null);
  const [showFullImage, setShowFullImage] = useState(false);
  const [isSavingAll, setIsSavingAll] = useState(false);
  const [saveProgress, setSaveProgress] = useState(0);

  const rawCanvasRef = useRef(document.createElement('canvas'));
  const warpedCanvasRef = useRef(document.createElement('canvas'));
  const reviewCanvasRef = useRef(null);
  const queueListRef = useRef(null);

  // Auto-scroll to currently processing item
  useEffect(() => {
    if (processingIndex !== null && queueListRef.current) {
      const activeItem = queueListRef.current.children[processingIndex];
      if (activeItem) {
        activeItem.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }, [processingIndex]);

  // Fetch OMR templates on load
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
    if (parsedCodes.length > 0 && !parsedCodes.includes(defaultQpCode)) {
      setDefaultQpCode(parsedCodes[0]);
    } else if (parsedCodes.length === 0) {
      setDefaultQpCode('');
    }
  }, [selectedTemplateName, templates]);

  useEffect(() => {
    if (!selectedTemplateName) return;

    let derivedId = '';
    const matchingTemplates = templates.filter(t => t.name === selectedTemplateName);

    if (defaultQpCode) {
      // Find the specific template ID for this Name + QP Code combo
      const exactMatch = matchingTemplates.find(t => t.qpcode && t.qpcode.split(',').map(c => c.trim()).includes(defaultQpCode));
      if (exactMatch) {
        derivedId = exactMatch.id;
      }
    }

    // Fallback to the first matching template if no exact QP code match is found
    if (!derivedId && matchingTemplates.length > 0) {
      derivedId = matchingTemplates[0].id;
    }

    setSelectedTemplateId(derivedId);
  }, [selectedTemplateName, defaultQpCode, templates]);

  useEffect(() => {
    if (selectedTemplateId) {
      fetchTemplateDetails(selectedTemplateId);
    }
  }, [selectedTemplateId]);

  const fetchTemplateDetails = async (id) => {
    try {
      const data = await api.getTemplates(id);
      if (data.success) {
        setSelectedTemplate(data.template);
      }
    } catch (err) {
      console.error("Failed to fetch template details", err);
    }
  };

  // Handle file uploads
  const handleFileChange = (e) => {
    const uploadedFiles = Array.from(e.target.files).filter(file => file.type.startsWith('image/'));
    const newQueue = uploadedFiles.map(file => ({
      file: file,
      name: file.name,
      status: 'pending', // pending | aligning | scanning | review | completed | failed
      error: '',
      results: null,
      alignedDataUrl: null,
      alignedBlob: null,
      scannedSheetId: null,
      studentRegno: '',
      sheetNumber: '',
      pattern: defaultPattern
    }));
    setFiles(prev => [...prev, ...newQueue]);
  };

  const removeFile = (idx) => {
    setFiles(files.filter((_, i) => i !== idx));
  };

  // Pre-upload raw scan to PHP backend
  const uploadRawScan = async (fileItem) => {
    const formData = new FormData();
    formData.append('template_id', selectedTemplateId);
    formData.append('scan_image', fileItem.file);

    const data = await api.uploadScan(formData);
    if (!data.success) {
      throw new Error(data.message || "Failed to upload scan to backend.");
    }
    return data; // returns scanned_sheet_id, raw_image_path
  };

  // Scan Bubbles from the Aligned Canvas
  const processAlignedOMR = (canvas, templateDetail) => {
    const ctx = canvas.getContext('2d');
    const globalImgData = ctx.getImageData(0, 0, canvas.width, canvas.height);

    // Parse Configurations
    let qConfig = templateDetail.questions_config;
    if (typeof qConfig === 'string') qConfig = JSON.parse(qConfig);

    let regConfig = templateDetail.regno_config;
    if (typeof regConfig === 'string') regConfig = JSON.parse(regConfig);

    let sheetConfig = templateDetail.sheetno_config;
    if (typeof sheetConfig === 'string') sheetConfig = JSON.parse(sheetConfig);

    let qpcodeConfig = templateDetail.qpcode_config;
    if (typeof qpcodeConfig === 'string') qpcodeConfig = JSON.parse(qpcodeConfig);

    // 1. Scan Student Reg No
    let regno = '';
    if (regConfig && regConfig.enabled) {
      const colSpacing = regConfig.width / (regConfig.columns - 1 || 1);
      const rowSpacing = regConfig.height / (regConfig.rows - 1 || 1);
      const cols = [];

      const is1to0 = regConfig.sequence === '1-0';
      for (let col = 0; col < regConfig.columns; col++) {
        const colBubbles = [];
        const x = regConfig.x + col * colSpacing;
        for (let row = 0; row < regConfig.rows; row++) {
          const y = regConfig.y + row * rowSpacing;
          let label;
          if (regConfig.rows === 10) {
            if (is1to0) {
              label = row === 9 ? "0" : (row + 1).toString();
            } else {
              label = row.toString();
            }
          } else {
            label = regConfig.rows === 9 ? (row + 1).toString() : row.toString();
          }
          colBubbles.push({
            label: label,
            x: Math.round(x),
            y: Math.round(y),
            r: regConfig.bubbleRadius
          });
        }
        cols.push(colBubbles);
      }

      const scanResult = scanRegistrationGrid(globalImgData, cols, 150);
      regno = scanResult.value;
    }

    // 2. Scan Sheet Number (Conditional on OMR bubble mode)
    let sheetNo = '';
    if (sheetConfig && sheetConfig.enabled && (sheetConfig.mode === 'bubble_grid' || !sheetConfig.mode)) {
      const colSpacing = sheetConfig.width / (sheetConfig.columns - 1 || 1);
      const rowSpacing = sheetConfig.height / (sheetConfig.rows - 1 || 1);
      const cols = [];

      for (let col = 0; col < sheetConfig.columns; col++) {
        const colBubbles = [];
        const x = sheetConfig.x + col * colSpacing;
        for (let row = 0; row < sheetConfig.rows; row++) {
          const y = sheetConfig.y + row * rowSpacing;
          const label = sheetConfig.rows === 9 ? (row + 1).toString() : row.toString();
          colBubbles.push({
            label: label,
            x: Math.round(x),
            y: Math.round(y),
            r: sheetConfig.bubbleRadius
          });
        }
        cols.push(colBubbles);
      }

      const scanResult = scanRegistrationGrid(globalImgData, cols, 150);
      sheetNo = scanResult.value;
    }

    let qpCode = '';
    if (qpcodeConfig && qpcodeConfig.enabled) {
      const colSpacing = qpcodeConfig.width / (qpcodeConfig.columns - 1 || 1);
      const rowSpacing = qpcodeConfig.height / (qpcodeConfig.rows - 1 || 1);
      const cols = [];

      const is1to0 = qpcodeConfig.sequence === '1-0';
      for (let col = 0; col < qpcodeConfig.columns; col++) {
        const colBubbles = [];
        const x = qpcodeConfig.x + col * colSpacing;
        for (let row = 0; row < qpcodeConfig.rows; row++) {
          const y = qpcodeConfig.y + row * rowSpacing;
          let label;
          if (qpcodeConfig.rows === 10) {
            if (is1to0) {
              label = row === 9 ? "0" : (row + 1).toString();
            } else {
              label = row.toString();
            }
          } else {
            label = qpcodeConfig.rows === 9 ? (row + 1).toString() : row.toString();
          }
          colBubbles.push({
            label: label,
            x: Math.round(x),
            y: Math.round(y),
            r: qpcodeConfig.bubbleRadius
          });
        }
        cols.push(colBubbles);
      }

      const scanResult = scanRegistrationGrid(globalImgData, cols, 150);
      qpCode = scanResult.value;
    }

    // 3. Scan Questions
    const responsesMap = {};
    qConfig.forEach(block => {
      // Re-calculate bubbles coordinates
      const bubbles = block.bubbles;

      // Group bubbles by question number
      const qGroups = {};
      bubbles.forEach(b => {
        if (!qGroups[b.qNum]) qGroups[b.qNum] = [];
        qGroups[b.qNum].push(b);
      });

      Object.keys(qGroups).forEach(qNum => {
        const qBubbles = qGroups[qNum];
        const scanResult = scanQuestionRow(globalImgData, qBubbles, 150);
        responsesMap[parseInt(qNum)] = {
          question_number: parseInt(qNum),
          selected_option: scanResult.selected,
          ratios: scanResult.ratios
        };
      });
    });

    const responses = Object.values(responsesMap).sort((a, b) => a.question_number - b.question_number);

    return {
      student_regno: regno,
      sheet_number: sheetNo,
      qpcode: qpCode,
      responses: responses
    };
  };

  // Run OMR processor loop
  const startProcessing = async (mode) => {
    if (files.length === 0) return;
    setIsProcessing(true);
    setScanMode(mode);
    setProcessingIndex(0);
  };

  useEffect(() => {
    if (!isProcessing || processingIndex === null) return;
    if (processingIndex >= files.length) {
      setIsProcessing(false);
      setProcessingIndex(null);

      if (scanMode === 'all') {
        // Queue finished. Find the first problematic sheet
        const firstErrorIdx = files.findIndex(f => f.status === 'review' || f.status === 'aligning');
        if (firstErrorIdx !== -1) {
          const errFile = files[firstErrorIdx];
          if (errFile.status === 'aligning') setAligningIndex(firstErrorIdx);
          else openReviewPanel(firstErrorIdx, errFile.results);
        }
      }
      return;
    }

    const processItem = async () => {
      const idx = processingIndex;
      const item = files[idx];

      if (item.status === 'completed' || item.status === 'failed' || item.status === 'review') {
        setProcessingIndex(idx + 1);
        return;
      }

      // Update item status
      updateFileItem(idx, { status: 'scanning' });

      try {
        // Step 1: Upload raw image
        let sheetId = item.scannedSheetId;
        if (!sheetId) {
          const uploadRes = await uploadRawScan(item);
          sheetId = uploadRes.scanned_sheet_id;
          updateFileItem(idx, { scannedSheetId: sheetId });
        }

        // Step 2: Auto anchor detection & warp
        let alignedBlob = item.alignedBlob;
        let scanResults = item.results;

        if (!alignedBlob) {
          // Load image on temporary canvas
          const img = await loadImage(URL.createObjectURL(item.file));
          const canvas = rawCanvasRef.current;
          canvas.width = img.width;
          canvas.height = img.height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0);

          // Detect anchors using template expectations
          const detected = await detectAnchors(canvas, selectedTemplate);

          if (!detected.autoDetected) {
            // Auto detection failed, require manual paper alignment
            updateFileItem(idx, { status: 'aligning' });
            if (scanMode === 'manual') {
              setIsProcessing(false);
              setAligningIndex(idx);
            } else {
              setProcessingIndex(idx + 1);
            }
            return;
          }

          // Warp image
          const warpedCanvas = warpedCanvasRef.current;
          warpedCanvas.width = selectedTemplate.width;
          warpedCanvas.height = selectedTemplate.height;

          let templateAnchors = selectedTemplate.anchors_json;
          if (typeof templateAnchors === 'string') templateAnchors = JSON.parse(templateAnchors);

          await warpPerspective(canvas, warpedCanvas, detected, {
            width: selectedTemplate.width,
            height: selectedTemplate.height,
            anchors: templateAnchors
          });

          // Convert to blob and dataUrl
          alignedBlob = await getCanvasBlob(warpedCanvas);
          const alignedDataUrl = warpedCanvas.toDataURL('image/jpeg', 0.9);

          updateFileItem(idx, {
            alignedBlob,
            alignedDataUrl
          });

          // Run scan algorithm on the warped canvas
          scanResults = processAlignedOMR(warpedCanvas, selectedTemplate);
        } else {
          // Already aligned, parse from dataUrl or canvas
          const img = await loadImage(item.alignedDataUrl);
          const canvas = warpedCanvasRef.current;
          canvas.width = selectedTemplate.width;
          canvas.height = selectedTemplate.height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0);

          scanResults = processAlignedOMR(canvas, selectedTemplate);
        }

        // Apply Sheet Number Mode Overrides
        let sheetConfig = selectedTemplate.sheetno_config;
        if (typeof sheetConfig === 'string') sheetConfig = JSON.parse(sheetConfig);

        if (sheetConfig && sheetConfig.enabled) {
          if (sheetConfig.mode === 'file_name') {
            scanResults.sheet_number = item.file.name.replace(/\.[^/.]+$/, "");
          } else if (sheetConfig.mode === 'auto_increment') {
            const startVal = parseInt(sheetConfig.startNumber) || 1001;
            scanResults.sheet_number = (startVal + idx).toString();
          } else if (sheetConfig.mode === 'manual_entry') {
            scanResults.sheet_number = sheetConfig.omr_id || '';
          } else if (sheetConfig.mode === 'barcode') {
            let barcodeVal = '';
            try {
              // Crop the barcode sub-region from the warped canvas
              const barcodeCanvas = document.createElement('canvas');
              const cropX = Math.max(0, parseInt(sheetConfig.x) || 0);
              const cropY = Math.max(0, parseInt(sheetConfig.y) || 0);
              const cropW = Math.min(warpedCanvasRef.current.width - cropX, parseInt(sheetConfig.width) || 100);
              const cropH = Math.min(warpedCanvasRef.current.height - cropY, parseInt(sheetConfig.height) || 50);

              // Add padding (quiet zone) and scale up for better detection
              const pad = 40;
              const scale = 2;
              barcodeCanvas.width = (cropW * scale) + (pad * 2);
              barcodeCanvas.height = (cropH * scale) + (pad * 2);
              const barcodeCtx = barcodeCanvas.getContext('2d');

              // Enable high-quality smoothing. Nearest-neighbor (false) causes severe jagged edges on warped barcodes!
              barcodeCtx.imageSmoothingEnabled = true;
              barcodeCtx.imageSmoothingQuality = 'high';

              // White background to provide contrast
              barcodeCtx.fillStyle = '#ffffff';
              barcodeCtx.fillRect(0, 0, barcodeCanvas.width, barcodeCanvas.height);

              // Draw warped image into barcode canvas with scaling
              barcodeCtx.drawImage(
                warpedCanvasRef.current,
                cropX, cropY, cropW, cropH,
                pad, pad, cropW * scale, cropH * scale
              );

              // Save the exact image for UI debugging
              const dataUrl = barcodeCanvas.toDataURL('image/jpeg', 1.0);
              scanResults.barcode_crop_url = dataUrl;

              // 1. Try Native BarcodeDetector first (highly robust on Chrome/Edge)
              if ('BarcodeDetector' in window) {
                try {
                  const barcodeDetector = new window.BarcodeDetector();
                  const barcodes = await barcodeDetector.detect(barcodeCanvas);
                  if (barcodes.length > 0) {
                    barcodeVal = barcodes[0].rawValue;
                  }
                } catch (e) {
                  console.warn("Native BarcodeDetector failed:", e);
                }
              }

              // 2. Fallback to html5-qrcode
              if (!barcodeVal) {
                const barcodeBlob = await new Promise(res => barcodeCanvas.toBlob(res, 'image/jpeg', 1.0));
                const barcodeFile = new File([barcodeBlob], "barcode.jpg", { type: "image/jpeg" });

                const dummyDiv = document.createElement('div');
                dummyDiv.id = `html5qr-code-dummy-${idx}`;
                // Element MUST be physically present and have dimensions for html5-qrcode to work
                dummyDiv.style.position = 'absolute';
                dummyDiv.style.top = '-9999px';
                dummyDiv.style.left = '-9999px';
                dummyDiv.style.width = '500px';
                dummyDiv.style.height = '500px';
                dummyDiv.style.opacity = '0';
                document.body.appendChild(dummyDiv);

                try {
                  const html5QrCode = new Html5Qrcode(dummyDiv.id);
                  const result = await html5QrCode.scanFile(barcodeFile, false);
                  if (result) {
                    barcodeVal = result;
                  }
                  try { await html5QrCode.clear(); } catch (e) { }
                } catch (err) {
                  console.warn("html5-qrcode could not find a barcode:", err);
                } finally {
                  document.body.removeChild(dummyDiv);
                }
              }
            } catch (err) {
              console.error("Canvas crop error:", err);
            }
            scanResults.sheet_number = barcodeVal || '?';
          }
        }

        // Check if registration number or sheet number contains unknown fills or requires review in Scan All mode
        let qpcodeConfig = selectedTemplate.qpcode_config;
        if (typeof qpcodeConfig === 'string') qpcodeConfig = JSON.parse(qpcodeConfig);

        let isQpcodeInvalid = false;
        const reasons = [];

        if (qpcodeConfig && qpcodeConfig.enabled) {
          if (!scanResults.qpcode || scanResults.qpcode.includes('?')) {
            isQpcodeInvalid = true;
            reasons.push("Incomplete QP Code");
          } else if (defaultQpCode && scanResults.qpcode !== defaultQpCode) {
            isQpcodeInvalid = true;
            reasons.push(`QP Code Mismatch (Expected ${defaultQpCode})`);
          } else if (!defaultQpCode && availableQpCodes.length > 0 && !availableQpCodes.includes(scanResults.qpcode)) {
            isQpcodeInvalid = true;
            reasons.push(`Unknown QP Code (${scanResults.qpcode})`);
          }
        }

        if (scanResults.student_regno.includes('?')) reasons.push("Incomplete Reg No");
        if (scanResults.sheet_number.includes('?')) reasons.push("Incomplete Sheet No");
        if (sheetConfig && sheetConfig.enabled && sheetConfig.mode === 'manual_entry' && !scanResults.sheet_number) reasons.push("Missing Manual Sheet No");
        if (scanResults.responses.some(r => r.selected_option === 'MULT')) reasons.push("Multiple Bubbles Filled");
        if (scanResults.responses.some(r => r.selected_option === 'BLANK')) reasons.push("Blank Responses Found");

        const isConflict = reasons.length > 0;

        if (scanMode === 'manual' || isConflict) {
          // Flag for review
          updateFileItem(idx, {
            status: 'review',
            reviewReason: reasons.join(", ") || "Manual Mode Request",
            results: scanResults,
            studentRegno: scanResults.student_regno.replace(/\?/g, ''),
            sheetNumber: scanResults.sheet_number.replace(/\?/g, '')
          });

          if (scanMode === 'manual') {
            setIsProcessing(false);
            openReviewPanel(idx, scanResults);
          } else {
            setProcessingIndex(idx + 1);
          }
          return;
        }

        // Defer saving to backend until 'Done Scanning' is clicked
        updateFileItem(idx, {
          status: 'completed',
          studentRegno: scanResults.student_regno,
          sheetNumber: scanResults.sheet_number,
          pattern: item.pattern || 'A',
          results: scanResults
        });

        // Continue queue
        setProcessingIndex(idx + 1);

      } catch (err) {
        console.error(err);
        updateFileItem(idx, { status: 'failed', error: err.message });
        setProcessingIndex(idx + 1);
      }
    };

    processItem();
  }, [isProcessing, processingIndex]);

  // Save scan details to SQL via PHP
  const saveResponsesToBackend = async (sheetId, regno, sheetNo, qpcode, responses, alignedBlob, pattern = 'A') => {
    const formData = new FormData();
    formData.append('scanned_sheet_id', sheetId);
    formData.append('student_regno', regno);
    formData.append('omr_id', sheetNo);
    formData.append('sheet_number', sheetNo);
    if (qpcode) formData.append('qpcode', qpcode);
    formData.append('status', 'approved');
    formData.append('responses', JSON.stringify(responses));
    formData.append('pattern', pattern);

    if (alignedBlob) {
      formData.append('aligned_image', alignedBlob, 'aligned.jpg');
    }

    const data = await api.saveResponse(formData);
    if (!data.success) {
      throw new Error(data.message || "Failed to save response data.");
    }
  };

  const handleDoneScanning = async () => {
    const completedFiles = files.filter(f => f.status === 'completed' && !f.savedToBackend);
    if (completedFiles.length === 0) {
      if (onEvaluationComplete) onEvaluationComplete();
      return;
    }

    setIsSavingAll(true);
    setSaveProgress(0);

    for (let i = 0; i < completedFiles.length; i++) {
      const item = completedFiles[i];
      try {
        await saveResponsesToBackend(
          item.scannedSheetId,
          item.studentRegno,
          item.sheetNumber,
          item.results?.qpcode,
          item.results?.responses,
          item.alignedBlob,
          item.pattern || 'A'
        );
        const fileIndex = files.findIndex(f => f === item);
        if (fileIndex !== -1) {
          updateFileItem(fileIndex, { savedToBackend: true });
        }
      } catch (err) {
        console.error(`Failed to save sheet ${item.sheetNumber}:`, err);
      }
      setSaveProgress(Math.round(((i + 1) / completedFiles.length) * 100));
    }

    setIsSavingAll(false);
    if (onEvaluationComplete) onEvaluationComplete();
  };

  // Helper utils
  const updateFileItem = (idx, fields) => {
    setFiles(prev => prev.map((item, i) => i === idx ? { ...item, ...fields } : item));
  };

  const loadImage = (src) => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });
  };

  const getCanvasBlob = (canvas) => {
    return new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.9));
  };

  // Manual alignment callbacks
  const handleAlignedCallback = (aligned) => {
    const idx = aligningIndex;
    updateFileItem(idx, {
      alignedBlob: aligned.blob,
      alignedDataUrl: aligned.dataUrl,
      status: 'pending'
    });
    setAligningIndex(null);
    // Resume queue from this specific item
    setProcessingIndex(idx);
    setIsProcessing(true);
  };

  // Manual Review Panel management
  const openReviewPanel = (idx, scanResults) => {
    setReviewingIndex(idx);
    const item = files[idx];
    setReviewData({
      studentRegno: scanResults.student_regno.replace(/\?/g, ''),
      sheetNumber: scanResults.sheet_number.replace(/\?/g, ''),
      qpcode: scanResults.qpcode ? scanResults.qpcode.replace(/\?/g, '') : '',
      responses: [...scanResults.responses],
      pattern: item.pattern || 'A'
    });
  };

  // Draw template overlays on aligned review image canvas
  useEffect(() => {
    if (reviewingIndex === null || !files[reviewingIndex] || !selectedTemplate || !reviewCanvasRef.current) return;

    const canvas = reviewCanvasRef.current;
    const ctx = canvas.getContext('2d');

    const img = new Image();
    img.onload = () => {
      canvas.width = img.width;
      canvas.height = img.height;
      ctx.drawImage(img, 0, 0);

      // Draw template overlays for visual alignment review
      // 1. Draw Registration Grid (Cyan)
      let regConfig = selectedTemplate.regno_config;
      if (regConfig) {
        if (typeof regConfig === 'string') regConfig = JSON.parse(regConfig);
        if (regConfig.enabled) {
          ctx.strokeStyle = '#06b6d4';
          ctx.lineWidth = 2;
          ctx.strokeRect(regConfig.x, regConfig.y, regConfig.width, regConfig.height);

          const colSpacing = regConfig.width / (regConfig.columns - 1 || 1);
          const rowSpacing = regConfig.height / (regConfig.rows - 1 || 1);
          for (let col = 0; col < regConfig.columns; col++) {
            const x = regConfig.x + col * colSpacing;
            for (let row = 0; row < regConfig.rows; row++) {
              const y = regConfig.y + row * rowSpacing;
              ctx.beginPath();
              ctx.arc(x, y, regConfig.bubbleRadius || 8, 0, 2 * Math.PI);
              ctx.stroke();
            }
          }
        }
      }

      // 2. Draw Sheet No Grid (Yellow)
      let sheetConfig = selectedTemplate.sheetno_config;
      if (sheetConfig) {
        if (typeof sheetConfig === 'string') sheetConfig = JSON.parse(sheetConfig);
        if (sheetConfig.enabled && (sheetConfig.mode === 'bubble_grid' || !sheetConfig.mode)) {
          ctx.strokeStyle = '#f59e0b';
          ctx.lineWidth = 2;
          ctx.strokeRect(sheetConfig.x, sheetConfig.y, sheetConfig.width, sheetConfig.height);

          const colSpacing = sheetConfig.width / (sheetConfig.columns - 1 || 1);
          const rowSpacing = sheetConfig.height / (sheetConfig.rows - 1 || 1);
          for (let col = 0; col < sheetConfig.columns; col++) {
            const x = sheetConfig.x + col * colSpacing;
            for (let row = 0; row < sheetConfig.rows; row++) {
              const y = sheetConfig.y + row * rowSpacing;
              ctx.beginPath();
              ctx.arc(x, y, sheetConfig.bubbleRadius || 8, 0, 2 * Math.PI);
              ctx.stroke();
            }
          }
        }
      }

      // Draw QP Code Grid (Orange)
      let qpcodeConfig = selectedTemplate.qpcode_config;
      if (qpcodeConfig) {
        if (typeof qpcodeConfig === 'string') qpcodeConfig = JSON.parse(qpcodeConfig);
        if (qpcodeConfig.enabled) {
          ctx.strokeStyle = '#f97316';
          ctx.lineWidth = 2;
          ctx.strokeRect(qpcodeConfig.x, qpcodeConfig.y, qpcodeConfig.width, qpcodeConfig.height);

          const colSpacing = qpcodeConfig.width / (qpcodeConfig.columns - 1 || 1);
          const rowSpacing = qpcodeConfig.height / (qpcodeConfig.rows - 1 || 1);
          for (let col = 0; col < qpcodeConfig.columns; col++) {
            const x = qpcodeConfig.x + col * colSpacing;
            for (let row = 0; row < qpcodeConfig.rows; row++) {
              const y = qpcodeConfig.y + row * rowSpacing;
              ctx.beginPath();
              ctx.arc(x, y, qpcodeConfig.bubbleRadius || 8, 0, 2 * Math.PI);
              ctx.stroke();
            }
          }
        }
      }

      // 3. Draw Question Bubbles (Green)
      let qConfig = selectedTemplate.questions_config;
      if (qConfig) {
        if (typeof qConfig === 'string') qConfig = JSON.parse(qConfig);
        ctx.strokeStyle = '#10b981';
        ctx.lineWidth = 1.5;
        qConfig.forEach(block => {
          if (block.bubbles) {
            block.bubbles.forEach(b => {
              ctx.beginPath();
              ctx.arc(b.x, b.y, b.r || 8, 0, 2 * Math.PI);
              ctx.stroke();
            });
          }
        });
      }
    };
    img.src = files[reviewingIndex].alignedDataUrl;
  }, [reviewingIndex, selectedTemplate, files]);

  const updateReviewResponse = (qIndex, selectedVal) => {
    setReviewData(prev => {
      const updated = [...prev.responses];
      updated[qIndex] = { ...updated[qIndex], selected_option: selectedVal };
      return { ...prev, responses: updated };
    });
  };

  const cancelReview = () => {
    setReviewingIndex(null);
    setReviewData(null);
    setIsProcessing(false);
  };

  const triggerManualAlignmentFromReview = () => {
    const idx = reviewingIndex;
    updateFileItem(idx, { status: 'aligning' });
    setReviewingIndex(null);
    setReviewData(null);
    setIsProcessing(false);
    setAligningIndex(idx);
  };

  const saveReviewApproval = async () => {
    let qpcodeConfig = selectedTemplate?.qpcode_config;
    if (typeof qpcodeConfig === 'string') qpcodeConfig = JSON.parse(qpcodeConfig);
    let regConfig = selectedTemplate?.regno_config;
    if (typeof regConfig === 'string') regConfig = JSON.parse(regConfig);
    let sheetConfig = selectedTemplate?.sheetno_config;
    if (typeof sheetConfig === 'string') sheetConfig = JSON.parse(sheetConfig);

    if (regConfig?.enabled && !reviewData.studentRegno?.trim()) {
      alert("Student Reg No is required to approve this sheet.");
      return;
    }
    if (sheetConfig?.enabled && !reviewData.sheetNumber?.trim()) {
      alert("OMR ID is required to approve this sheet.");
      return;
    }
    if (qpcodeConfig?.enabled && !reviewData.qpcode?.trim()) {
      alert("QP Code is required to approve this sheet.");
      return;
    }

    setLoadingReviewSave(true);
    const idx = reviewingIndex;
    const item = files[idx];

    try {
      // Defer saving to backend until 'Done Scanning' is clicked
      updateFileItem(idx, {
        status: 'completed',
        studentRegno: reviewData.studentRegno,
        sheetNumber: reviewData.sheetNumber,
        pattern: reviewData.pattern || 'A',
        results: {
          ...item.results,
          student_regno: reviewData.studentRegno,
          sheet_number: reviewData.sheetNumber,
          responses: reviewData.responses
        }
      });

      setReviewingIndex(null);
      setReviewData(null);

      if (scanMode === 'all') {
        const nextErrorIdx = files.findIndex((f, i) => i > idx && (f.status === 'review' || f.status === 'aligning'));
        if (nextErrorIdx !== -1) {
          const errFile = files[nextErrorIdx];
          if (errFile.status === 'aligning') setAligningIndex(nextErrorIdx);
          else openReviewPanel(nextErrorIdx, errFile.results);
        }
      } else {
        // Resume the processing queue
        setProcessingIndex(idx + 1);
        setIsProcessing(true);
      }
    } catch (err) {
      alert("Error saving approved results: " + err.message);
    } finally {
      setLoadingReviewSave(false);
    }
  };

  const [loadingReviewSave, setLoadingReviewSave] = useState(false);
  const [bubbleCropCache, setBubbleCropCache] = useState({});

  // Render cropped bubbles inline inside the table row
  const renderCroppedBubbleRow = (qData, qIndex) => {
    // Find the bubble configuration in template questions_config
    if (!selectedTemplate) return null;
    let qConfig = selectedTemplate.questions_config;
    if (typeof qConfig === 'string') qConfig = JSON.parse(qConfig);

    // Find matching bubble config coordinates
    let bubbleCoords = null;
    for (let block of qConfig) {
      bubbleCoords = block.bubbles.filter(b => b.qNum === qData.question_number);
      if (bubbleCoords.length > 0) break;
    }

    if (!bubbleCoords || bubbleCoords.length === 0) return null;

    // Use a small helper canvas render
    return (
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
        {bubbleCoords.map((coord, cIdx) => {
          const isSelected = qData.selected_option === coord.label;
          return (
            <div
              key={cIdx}
              onClick={() => updateReviewResponse(qIndex, coord.label)}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                cursor: 'pointer',
                opacity: isSelected ? 1 : 0.6,
                transform: isSelected ? 'scale(1.15)' : 'none',
                transition: 'var(--transition)'
              }}
            >
              <div
                style={{
                  width: '28px',
                  height: '28px',
                  borderRadius: '50%',
                  border: isSelected ? '2px solid var(--accent-secondary)' : '1px solid var(--border-color)',
                  background: isSelected ? 'rgba(6, 182, 212, 0.2)' : 'var(--bg-primary)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '11px',
                  fontWeight: 700,
                  color: isSelected ? 'var(--accent-secondary)' : 'var(--text-secondary)'
                }}
              >
                {coord.label}
              </div>
            </div>
          );
        })}
        <button
          onClick={() => updateReviewResponse(qIndex, 'BLANK')}
          style={{
            padding: '2px 6px',
            fontSize: '10px',
            background: qData.selected_option === 'BLANK' ? 'rgba(239, 68, 68, 0.2)' : 'transparent',
            border: '1px solid var(--border-color)',
            color: qData.selected_option === 'BLANK' ? 'var(--danger)' : 'var(--text-muted)',
            borderRadius: '4px',
            cursor: 'pointer'
          }}
        >
          Clear
        </button>
      </div>
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>

      {/* 1. Template Select & Upload Section */}
      {aligningIndex === null && reviewingIndex === null && (
        <div className="grid-2">

          {/* Controls Card */}
          <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 700 }}>OMR Scanning Console</h2>

            <div className="form-group">
              <label className="form-label">Select Scanning Template</label>
              <SearchableDropdown
                options={uniqueTemplateNames}
                value={selectedTemplateName}
                onChange={setSelectedTemplateName}
                disabled={isProcessing}
                placeholder="-- Choose Template --"
              />
            </div>

            {selectedTemplateName && availableQpCodes.length > 0 && (
              <div className="form-group">
                <label className="form-label">Default QP Code</label>
                <SearchableDropdown
                  options={availableQpCodes}
                  value={defaultQpCode}
                  onChange={setDefaultQpCode}
                  disabled={isProcessing}
                  placeholder="Select or enter QP Code"
                  allowCustom={true}
                />
              </div>
            )}

            <div className="form-group">
              <label className="form-label">Default Paper Pattern</label>
              <SearchableDropdown
                options={[
                  { label: "Pattern A", value: "A" },
                  { label: "Pattern B", value: "B" },
                  { label: "Pattern C", value: "C" },
                  { label: "Pattern D", value: "D" }
                ]}
                value={defaultPattern}
                onChange={setDefaultPattern}
                disabled={isProcessing}
              />
            </div>

            {selectedTemplate && (
              <div style={{ display: 'flex', gap: '1rem' }}>
                <div
                  style={{
                    flex: 1,
                    border: '2px dashed var(--border-color)',
                    borderRadius: 'var(--radius-sm)',
                    padding: '1.5rem 1rem',
                    textAlign: 'center',
                    cursor: isProcessing ? 'not-allowed' : 'pointer'
                  }}
                  onClick={() => !isProcessing && document.getElementById('scan-uploader').click()}
                >
                  <input
                    type="file"
                    id="scan-uploader"
                    style={{ display: 'none' }}
                    multiple
                    accept="image/*"
                    onChange={handleFileChange}
                    disabled={isProcessing}
                  />
                  <p style={{ fontSize: '0.9rem', fontWeight: 600 }}>Upload Files</p>
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>Select specific images</p>
                </div>

                <div
                  style={{
                    flex: 1,
                    border: '2px dashed var(--border-color)',
                    borderRadius: 'var(--radius-sm)',
                    padding: '1.5rem 1rem',
                    textAlign: 'center',
                    cursor: isProcessing ? 'not-allowed' : 'pointer'
                  }}
                  onClick={() => !isProcessing && document.getElementById('scan-folder-uploader').click()}
                >
                  <input
                    type="file"
                    id="scan-folder-uploader"
                    style={{ display: 'none' }}
                    webkitdirectory="true"
                    directory="true"
                    multiple
                    accept="image/*"
                    onChange={handleFileChange}
                    disabled={isProcessing}
                  />
                  <p style={{ fontSize: '0.9rem', fontWeight: 600 }}>Upload Folder</p>
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>Batch load entire folder</p>
                </div>
              </div>
            )}

            {files.length > 0 && !isProcessing && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '1rem' }}>
                <div style={{ display: 'flex', gap: '1rem' }}>
                  <button
                    className="btn btn-primary"
                    style={{ flex: 1 }}
                    onClick={() => startProcessing('all')}
                  >
                    <Play size={16} /> Scan All (Auto)
                  </button>
                  <button
                    className="btn btn-secondary"
                    style={{ flex: 1 }}
                    onClick={() => startProcessing('manual')}
                  >
                    <CheckSquare size={16} /> Manual Approval
                  </button>
                </div>
                {isSavingAll ? (
                  <div style={{ padding: '0.75rem', background: 'rgba(255,255,255,0.05)', borderRadius: '6px' }}>
                    <p style={{ fontSize: '0.85rem', marginBottom: '0.5rem', textAlign: 'center' }}>Saving Results to Database: {saveProgress}%</p>
                    <div style={{ width: '100%', height: '8px', background: 'var(--bg-tertiary)', borderRadius: '4px', overflow: 'hidden' }}>
                      <div style={{ width: `${saveProgress}%`, height: '100%', background: 'var(--accent-secondary)', transition: 'width 0.2s' }}></div>
                    </div>
                  </div>
                ) : (
                  <button
                    className="btn btn-success"
                    style={{ width: '100%', padding: '0.75rem', fontWeight: 600 }}
                    onClick={handleDoneScanning}
                    disabled={files.length === 0}
                  >
                    Done Scanning &rarr; View Results
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Queue List Card */}
          <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: '1rem', height: 'calc(100vh - 140px)', overflowY: 'auto' }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Scans Queue ({files.length} sheets)</h3>

            {files.length === 0 ? (
              <div style={{ display: 'flex', flex: 1, alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                No sheets uploaded yet.
              </div>
            ) : (
              <div ref={queueListRef} style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {files.map((item, idx) => (
                  <div
                    key={idx}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'between',
                      background: 'rgba(255,255,255,0.02)',
                      padding: '0.75rem',
                      borderRadius: '6px',
                      border: idx === processingIndex ? '1px solid var(--accent-primary)' : '1px solid var(--border-color)'
                    }}
                  >
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem', flex: 1 }}>
                      <span style={{ fontSize: '0.85rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '220px' }}>{item.name}</span>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
                        {item.status === 'failed' && <span style={{ color: 'var(--danger)' }}>Error: {item.error}</span>}
                        {item.status === 'pending' && <span>Queued</span>}
                        {item.status === 'scanning' && <span>Scanning...</span>}
                        {item.status === 'aligning' && <span style={{ color: 'var(--warning)' }}>Alignment Failed - Needs Adjustment</span>}
                        {item.status === 'review' && <span style={{ color: 'var(--accent-primary)' }}>Conflicts: {item.reviewReason || 'Needs Review'}</span>}

                        {(item.studentRegno || item.sheetNumber) && (
                          <span style={{ borderLeft: '1px solid var(--border-color)', paddingLeft: '0.5rem' }}>
                            RegNo: <strong>{item.studentRegno}</strong> | OMR: <strong>{item.sheetNumber}</strong>
                          </span>
                        )}
                        {item.results && item.results.responses && (
                          <span style={{ borderLeft: '1px solid var(--border-color)', paddingLeft: '0.5rem' }}>
                            {item.results.responses.length} ans
                          </span>
                        )}
                      </span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <SearchableDropdown
                        options={[
                          { label: "Pattern A", value: "A" },
                          { label: "Pattern B", value: "B" },
                          { label: "Pattern C", value: "C" },
                          { label: "Pattern D", value: "D" }
                        ]}
                        value={item.pattern || 'A'}
                        onChange={(val) => updateFileItem(idx, { pattern: val })}
                        disabled={isProcessing}
                        style={{ width: '120px', fontSize: '0.75rem' }}
                        className="form-input"
                      />

                      {item.status === 'completed' && <span className="badge badge-success">Success</span>}
                      {item.status === 'failed' && <span className="badge badge-danger">Failed</span>}
                      {item.status === 'aligning' && <span className="badge badge-warning">Adjust Page</span>}
                      {item.status === 'review' && <span className="badge badge-primary">Review</span>}

                      {(item.status === 'aligning' || item.status === 'review' || item.status === 'completed' || item.status === 'failed') && (
                        <button
                          className="btn btn-secondary"
                          style={{ padding: '4px 8px', fontSize: '0.75rem' }}
                          onClick={() => setAligningIndex(idx)}
                        >
                          Align
                        </button>
                      )}

                      {item.status === 'review' && (
                        <button
                          className="btn btn-primary"
                          style={{ padding: '4px 8px', fontSize: '0.75rem' }}
                          onClick={() => openReviewPanel(idx, item.results)}
                        >
                          Review
                        </button>
                      )}

                      {!isProcessing && (
                        <button
                          style={{ background: 'transparent', border: 0, color: 'var(--text-muted)', cursor: 'pointer' }}
                          onClick={() => removeFile(idx)}
                        >
                          <Trash size={14} />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 2. Paper Alignment View Override */}
      {aligningIndex !== null && (
        <div className="glass-card">
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '1rem' }}>Adjust Paper Registration: {files[aligningIndex].name}</h2>
          <OMRImageAdjuster
            file={files[aligningIndex].file}
            template={selectedTemplate}
            onAligned={handleAlignedCallback}
          />
        </div>
      )}

      {/* 3. Manual Approval Side Panel Overlay */}
      {reviewingIndex !== null && reviewData && (
        <div className="glass-card" style={{ display: 'grid', gridTemplateColumns: '400px 1fr', gap: '2rem' }}>

          {/* Left: Aligned Scan Sheet View */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', borderRight: '1px solid var(--border-color)', paddingRight: '1.5rem' }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 700 }}>Sheet Visual Reference (Aligned Overlay)</h3>
            <div style={{ border: '1px solid var(--border-color)', borderRadius: '8px', overflow: 'hidden', background: '#090b11', padding: '0.5rem', position: 'relative' }}>
              <canvas
                ref={reviewCanvasRef}
                style={{ width: '100%', height: 'auto', display: 'block', borderRadius: '4px' }}
              />
              <button
                className="btn btn-secondary"
                style={{ position: 'absolute', bottom: '1rem', right: '1rem', padding: '6px 12px', background: 'rgba(0,0,0,0.8)', border: '1px solid rgba(255,255,255,0.2)', backdropFilter: 'blur(4px)' }}
                onClick={() => setShowFullImage(true)}
              >
                View Full Sheet
              </button>
            </div>

            {files[reviewingIndex] && files[reviewingIndex].results && files[reviewingIndex].results.barcode_crop_url && (
              <div style={{ marginTop: '0.5rem', padding: '0.75rem', background: 'rgba(255,255,255,0.02)', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                <h4 style={{ fontSize: '0.85rem', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>Scanner Barcode View (Debug)</h4>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>If the barcode below looks cut off, blurry, or missing, adjust the Box X/Y/Width in the Template Designer.</p>
                <img
                  src={files[reviewingIndex].results.barcode_crop_url}
                  alt="Cropped Barcode"
                  style={{ maxWidth: '100%', border: '1px dashed var(--accent-primary)', background: '#fff' }}
                />
              </div>
            )}
          </div>

          {/* Right: Manual Verification and Fills Editor */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ fontSize: '1.2rem', fontWeight: 700 }}>Question-Wise Approval</h3>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Verify detected options and enter student info.</p>
                {files[reviewingIndex] && files[reviewingIndex].reviewReason && (
                  <div style={{ marginTop: '0.5rem', padding: '0.5rem', background: 'rgba(249, 115, 22, 0.1)', color: 'var(--warning)', borderRadius: '4px', fontSize: '0.85rem' }}>
                    <strong>Reason for Review:</strong> {files[reviewingIndex].reviewReason}
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                  className="btn btn-secondary"
                  onClick={cancelReview}
                  disabled={loadingReviewSave}
                >
                  Back to Queue
                </button>
                <button
                  className="btn btn-warning"
                  onClick={triggerManualAlignmentFromReview}
                  disabled={loadingReviewSave}
                >
                  Re-Align Sheet
                </button>
                <button
                  className="btn btn-success"
                  onClick={saveReviewApproval}
                  disabled={loadingReviewSave}
                >
                  {loadingReviewSave ? 'Saving...' : 'Approve & Save Responses'}
                </button>
              </div>
            </div>

            {/* Student Registration + Sheet No Forms + Pattern */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '1rem', background: 'var(--bg-primary)', padding: '1rem', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Student Regno</label>
                <input
                  type="text"
                  className="form-input"
                  value={reviewData.studentRegno}
                  onChange={(e) => setReviewData({ ...reviewData, studentRegno: e.target.value.toUpperCase() })}
                  placeholder="Enter Student Reg No"
                />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">OMR ID</label>
                <input
                  type="text"
                  className="form-input"
                  value={reviewData.sheetNumber}
                  onChange={(e) => setReviewData({ ...reviewData, sheetNumber: e.target.value })}
                  placeholder="Enter OMR ID"
                />
              </div>
              {availableQpCodes.length > 0 && (
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">QP Code</label>
                  <SearchableDropdown
                    options={availableQpCodes}
                    value={reviewData.qpcode}
                    onChange={(val) => setReviewData({ ...reviewData, qpcode: val })}
                    placeholder="Scanned QP Code"
                    allowCustom={true}
                  />
                </div>
              )}
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Pattern</label>
                <SearchableDropdown
                  options={[
                    { label: "Pattern A", value: "A" },
                    { label: "Pattern B", value: "B" },
                    { label: "Pattern C", value: "C" },
                    { label: "Pattern D", value: "D" }
                  ]}
                  value={reviewData.pattern}
                  onChange={(val) => setReviewData({ ...reviewData, pattern: val })}
                />
              </div>
            </div>

            {/* Questions List with inline bubble options */}
            <div style={{ flex: 1, overflowY: 'auto', maxHeight: '450px', border: '1px solid var(--border-color)', borderRadius: '8px' }}>
              <table className="custom-table">
                <thead>
                  <tr>
                    <th style={{ width: '80px' }}>Qn#</th>
                    <th>Select Filled Bubble (Interactive Crop Row)</th>
                    <th style={{ width: '120px' }}>Detected</th>
                  </tr>
                </thead>
                <tbody>
                  {reviewData.responses.map((qData, qIdx) => (
                    <tr key={qData.question_number} style={{ background: qData.selected_option === 'BLANK' || qData.selected_option === 'MULT' ? 'rgba(239, 68, 68, 0.05)' : 'transparent' }}>
                      <td style={{ fontWeight: 600 }}>Q{qData.question_number}</td>
                      <td>{renderCroppedBubbleRow(qData, qIdx)}</td>
                      <td>
                        <span className={`badge ${qData.selected_option === 'BLANK' ? 'badge-danger' : qData.selected_option === 'MULT' ? 'badge-warning' : 'badge-success'}`}>
                          {qData.selected_option}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

          </div>

        </div>
      )}

      {/* 4. Full Screen Image Overlay */}
      {showFullImage && reviewingIndex !== null && files[reviewingIndex] && (
        <div style={{
          position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
          background: 'rgba(0,0,0,0.9)', zIndex: 9999,
          display: 'flex', flexDirection: 'column', padding: '2rem'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem', alignItems: 'center' }}>
            <h3 style={{ color: '#fff', fontSize: '1.25rem' }}>Full Sheet View - {files[reviewingIndex].name}</h3>
            <button className="btn btn-secondary" onClick={() => setShowFullImage(false)}>Close Full View</button>
          </div>
          <div style={{ flex: 1, overflow: 'auto', display: 'flex', justifyContent: 'center', background: '#000', borderRadius: '8px', border: '1px solid #333' }}>
            <img
              src={files[reviewingIndex].alignedDataUrl || URL.createObjectURL(files[reviewingIndex].file)}
              alt="Full OMR Sheet"
              style={{ maxWidth: '100%', objectFit: 'contain' }}
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default OMRScanConsole;
