(function () {
  // Receive loadedContent and metadata from parent and render into this iframe
  window.addEventListener('message', function (ev) {
    try {
      const data = ev.data;
      if (!data || data.type !== 'renderReader') return;
      const payload = data.payload || {};
      const loadedContent = payload.loadedContent || [];
      const cururl = payload.cururl || window.location.href;
      const rTitle = payload.rTitle || document.title;
      // Insert title
      document.getElementById('lrbk_title').textContent = typeof loadedContent[0] === 'string' ? loadedContent[0] : rTitle;
      // Insert content (use Convert from html-handling.js)
      const raw = loadedContent[4] || '';
      let lines = [];
      try {
        lines = Convert(raw);
      } catch (e) {
        // fallback: wrap raw
        lines = ['<p>' + (raw || '') + '</p>'];
      }
      const container = document.getElementById('gnContent');
      container.innerHTML = lines.join('');
      // update simple nav info
      const total = payload.pages || 1;
      document.getElementById('totalindex').textContent = total;
      document.getElementById('currentindex').textContent = payload.currentIndex !== undefined ? payload.currentIndex : 1;
      // Basic click handlers within iframe
      container.addEventListener('click', function (e) {
        // example: send click events to parent if needed
        parent.postMessage({ type: 'readerClick', href: null }, '*');
      });

      // remove inline styles in reader iframe to keep consistent styling
      Array.from(document.querySelectorAll('[style]')).forEach(n => n.removeAttribute('style'));

    } catch (err) {
      console.error('reader-frame render error', err);
    }
  }, false);

  // notify parent when frame is ready
  parent.postMessage({ type: 'readerFrameReady' }, '*');
})();