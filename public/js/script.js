const cursor = document.querySelector('.cursor');
let mouseX = 0, mouseY = 0; // To track mouse position
let isMoving = false; // To track if the cursor is moving

// Function to create and animate the cursor trail
function createTrail(x, y) {
    const trail = document.createElement('div');
    trail.classList.add('cursor-trail');
    document.body.appendChild(trail);

    trail.style.left = `${x - 10}px`;  // Offset to center the trail
    trail.style.top = `${y - 10}px`;  // Offset to center the trail

    // Remove the trail after animation completes
    setTimeout(() => {
        trail.remove();
    }, 500); // Duration of the animation
}

// Function to update cursor position
function moveCursor(event) {
    const { clientX: x, clientY: y } = event;

    // Update cursor position
    cursor.style.left = `${x - 10}px`;
    cursor.style.top = `${y - 10}px`;

    // Create trail at each position
    createTrail(x, y);

    // Set the moving state to true
    if (!isMoving) {
        isMoving = true;
        cursor.classList.remove('heartbeat');
    }
}

// Function to handle when the cursor is stationary
function checkIfStationary() {
    if (!isMoving) {
        cursor.classList.add('heartbeat');
    } else {
        cursor.classList.remove('heartbeat');
    }
}

// Listen for mouse movement
document.addEventListener('mousemove', (event) => {
    moveCursor(event);

    // Set the moving state to false after a short delay
    clearTimeout(mouseMoveTimeout);
    mouseMoveTimeout = setTimeout(() => {
        isMoving = false;
    }, 100);
});

// Check if the cursor is stationary
let mouseMoveTimeout;
setInterval(checkIfStationary, 100);
