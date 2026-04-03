// Watch Party UI Components - Interactive Demo

document.addEventListener('DOMContentLoaded', () => {
  // Character counter for chat input
  const chatInput = document.querySelector('.chat-input');
  const charCount = document.querySelector('.char-count');
  
  if (chatInput && charCount) {
    chatInput.addEventListener('input', (e) => {
      const count = e.target.value.length;
      charCount.textContent = `${count}/300`;
      
      if (count > 280) {
        charCount.style.color = '#ff4e45';
      } else if (count > 250) {
        charCount.style.color = '#f9a825';
      } else {
        charCount.style.color = '#aaaaaa';
      }
    });
  }

  // Simulate progress bar animation
  const progressFills = document.querySelectorAll('.progress-fill:not(.indeterminate)');
  
  // Toggle switches
  const toggles = document.querySelectorAll('.yt-toggle input');
  toggles.forEach(toggle => {
    toggle.addEventListener('change', (e) => {
      const label = e.target.parentElement.querySelector('.toggle-label');
      if (label && label.textContent.includes('Notifications')) {
        label.textContent = e.target.checked ? 'Notifications enabled' : 'Notifications disabled';
      }
    });
  });

  // Chip selection
  const chips = document.querySelectorAll('.yt-chip');
  chips.forEach(chip => {
    chip.addEventListener('click', (e) => {
      const parent = e.target.parentElement;
      parent.querySelectorAll('.yt-chip').forEach(c => c.classList.remove('active'));
      e.target.classList.add('active');
    });
  });

  // Simulate live viewer count updates
  const viewerCounts = document.querySelectorAll('.viewer-count, .chat-viewers');
  setInterval(() => {
    viewerCounts.forEach(el => {
      const text = el.textContent;
      const match = text.match(/(\d+)/);
      if (match) {
        const currentCount = parseInt(match[1]);
        const newCount = currentCount + Math.floor(Math.random() * 3) - 1;
        el.innerHTML = el.innerHTML.replace(/\d+/, Math.max(1, newCount));
      }
    });
  }, 5000);

  console.log('Watch Party UI Components loaded successfully!');
});
