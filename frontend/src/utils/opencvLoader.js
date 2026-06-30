let opencvLoadingPromise = null;

export const loadOpenCV = () => {
  if (window.cv) {
    return Promise.resolve(window.cv);
  }

  if (opencvLoadingPromise) {
    return opencvLoadingPromise;
  }

  opencvLoadingPromise = new Promise((resolve, reject) => {
    // Check if script already exists
    const existingScript = document.getElementById('opencv-cdn');
    if (existingScript) {
      if (window.cv) {
        resolve(window.cv);
      } else {
        // Wait for it to initialize
        const interval = setInterval(() => {
          if (window.cv && window.cv.onRuntimeInitialized) {
            clearInterval(interval);
            resolve(window.cv);
          }
        }, 100);
      }
      return;
    }

    const script = document.createElement('script');
    script.id = 'opencv-cdn';
    script.src = 'https://docs.opencv.org/4.7.0/opencv.js';
    script.async = true;
    script.type = 'text/javascript';

    // Set callback for OpenCV runtime initialization
    script.onload = () => {
      // OpenCV takes a moment to prepare the WebAssembly environment
      const checkRuntime = setInterval(() => {
        if (window.cv && window.cv.Mat) {
          clearInterval(checkRuntime);
          resolve(window.cv);
        }
      }, 100);
    };

    script.onerror = (err) => {
      opencvLoadingPromise = null;
      reject(new Error('Failed to load OpenCV.js from CDN. Check your internet connection.'));
    };

    document.body.appendChild(script);
  });

  return opencvLoadingPromise;
};
