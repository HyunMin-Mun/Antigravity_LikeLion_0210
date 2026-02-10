document.addEventListener('DOMContentLoaded', () => {
    const countDisplay = document.getElementById('visitor-count');
    const incrementBtn = document.getElementById('increment-btn');

    // Load initial count from localStorage
    let count = parseInt(localStorage.getItem('visitorCount')) || 0;
    countDisplay.textContent = count;

    // Handle button click
    incrementBtn.addEventListener('click', () => {
        count++;
        updateCount(count);
        
        // Simple animation on click
        countDisplay.style.transform = 'scale(1.2)';
        setTimeout(() => {
            countDisplay.style.transform = 'scale(1)';
        }, 100);
    });

    function updateCount(newCount) {
        countDisplay.textContent = newCount;
        localStorage.setItem('visitorCount', newCount);
    }
});
