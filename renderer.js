const selectFolderBtn = document.getElementById('selectFolderBtn');
const atlasSizeSelect = document.getElementById('atlasSizeSelect');
const paddingSelect = document.getElementById('paddingSelect');
const sortingMethodSelect = document.getElementById('sortingMethodSelect');
const toggleThemeBtn = document.getElementById('toggleThemeBtn');
const fileListContainer = document.getElementById('fileListContainer');
const previewCanvas = document.getElementById('previewCanvas');
const ctx = previewCanvas.getContext('2d');
const canvasContainer = document.getElementById('canvasContainer');

const saveAtlasBtn = document.getElementById('saveAtlasBtn');

let selectedFolder = null;
let imageFiles = [];
let packedAtlasDataUrl = null;
let zoomLevel = 1;
const zoomStep = 0.1;
let isCustomSorting = false;

// Event listener for selecting a folder
selectFolderBtn.addEventListener('click', async () => {
  try {
    selectedFolder = await window.electronAPI.selectFolder();
    if (selectedFolder) {
      imageFiles = await window.electronAPI.loadImages(selectedFolder);
      console.log('Loaded images:', imageFiles);
      await updateFileList();
      updateAtlas();
    }
  } catch (error) {
    console.error('Error selecting folder:', error);
    alert('Error selecting folder: ' + error.message);
  }
});

// Event listeners for atlas options
[atlasSizeSelect, paddingSelect, sortingMethodSelect].forEach(select => {
  select.addEventListener('change', () => {
    isCustomSorting = sortingMethodSelect.value === 'custom';
    updateFileList();
    updateAtlas();
  });
});

// Event listener for toggling theme
toggleThemeBtn.addEventListener('click', async () => {
  const isDark = await window.electronAPI.toggleDarkMode();
  applyTheme(isDark);
});

// Function to update the file list
async function updateFileList() {
  const sortingMethod = sortingMethodSelect.value;
  const [method, order] = sortingMethod.split('-');
  
  if (!isCustomSorting) {
    // Sort imageFiles based on the selected method
    imageFiles.sort((a, b) => {
      let comparison;
      switch (method) {
        case 'fileSize':
          comparison = a.stats.size - b.stats.size;
          break;
        case 'name':
          comparison = a.name.localeCompare(b.name);
          break;
        case 'updated':
          comparison = a.stats.mtime.getTime() - b.stats.mtime.getTime();
          break;
        default:
          return 0;
      }
      return order === 'asc' ? comparison : -comparison;
    });
  }

  fileListContainer.innerHTML = '';
  for (const file of imageFiles) {
    const li = document.createElement('li');
    li.draggable = true;
    li.dataset.path = file.path;
    
    // Create image preview
    const img = document.createElement('img');
    const preview = await window.electronAPI.getImagePreview(file.path);
    img.src = preview.preview;
    img.alt = file.name;
    li.appendChild(img);

    // Create info container
    const infoDiv = document.createElement('div');
    infoDiv.className = 'file-info';

    // File name
    const nameSpan = document.createElement('span');
    nameSpan.className = 'file-name';
    nameSpan.textContent = file.name;
    infoDiv.appendChild(nameSpan);

    // File size
    const sizeSpan = document.createElement('span');
    sizeSpan.className = 'file-size';
    sizeSpan.textContent = formatFileSize(file.stats.size);
    infoDiv.appendChild(sizeSpan);

    li.appendChild(infoDiv);
    fileListContainer.appendChild(li);

    // Add drag and drop event listeners
    li.addEventListener('dragstart', dragStart);
    li.addEventListener('dragover', dragOver);
    li.addEventListener('drop', drop);
  }
}

// Drag and drop functions
function dragStart(e) {
  e.dataTransfer.setData('text/plain', e.target.dataset.path);
  e.target.style.opacity = '0.5';
}

function dragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
}

function drop(e) {
  e.preventDefault();
  const draggedPath = e.dataTransfer.getData('text');
  const draggedElement = document.querySelector(`[data-path="${draggedPath}"]`);
  const dropTarget = e.target.closest('li');

  if (draggedElement && dropTarget && draggedElement !== dropTarget) {
    const draggedIndex = Array.from(fileListContainer.children).indexOf(draggedElement);
    const dropIndex = Array.from(fileListContainer.children).indexOf(dropTarget);

    if (draggedIndex < dropIndex) {
      fileListContainer.insertBefore(draggedElement, dropTarget.nextSibling);
    } else {
      fileListContainer.insertBefore(draggedElement, dropTarget);
    }

    // Update imageFiles array to match new order
    const newImageFiles = Array.from(fileListContainer.children).map(li => 
      imageFiles.find(file => file.path === li.dataset.path)
    );
    imageFiles = newImageFiles;

    // Update atlas
    updateAtlas();
  }

  draggedElement.style.opacity = '1';
}

// Function to update the atlas
async function updateAtlas() {
  if (imageFiles.length === 0) return;
  
  try {
    const atlasSize = parseInt(atlasSizeSelect.value);
    const padding = parseInt(paddingSelect.value);
    const sortingMethod = sortingMethodSelect.value;
    
    console.log('Updating atlas with options:', { atlasSize, padding, sortingMethod, imageFiles });
    const result = await window.electronAPI.packTexture({
      imagePaths: imageFiles.map(file => file.path),
      atlasSize,
      padding,
      sortingMethod
    });
    
    console.log('Texture packed result:', result);
    
    if (!result || !result.packedRects || result.packedRects.length === 0) {
      throw new Error('No images were packed into the atlas');
    }
    
    packedAtlasDataUrl = await renderAtlas(result.packedRects, result.images, atlasSize);
    console.log('Atlas rendered');
    updatePreview(packedAtlasDataUrl);
    
    // Enable the save button after successful atlas generation
    saveAtlasBtn.disabled = false;
  } catch (error) {
    console.error('Error updating atlas:', error);
    alert('Error updating atlas: ' + error.message);
    
    // Disable the save button if there's an error
    saveAtlasBtn.disabled = true;
  }
}

// Helper functions (renderAtlas, updatePreview, formatFileSize, etc.) remain the same

// Initialize the application
async function init() {
  const isDark = await window.electronAPI.getTheme();
  applyTheme(isDark);
  updatePreview('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACklEQVR4nGMAAQAABQABDQottAAAAABJRU5ErkJggg==');
  
  // Update sorting method options
  const sortingMethods = [
    { value: 'name-asc', label: 'Name (A-Z)' },
    { value: 'name-desc', label: 'Name (Z-A)' },
    { value: 'fileSize-asc', label: 'File Size (Small - Large)' },
    { value: 'fileSize-desc', label: 'File Size (Large - Small)' },
    { value: 'updated-desc', label: 'Date Modified (Newest - Oldest)' },
    { value: 'updated-asc', label: 'Date Modified (Oldest - Newest)' },
    { value: 'custom', label: 'Custom (Drag & Drop)' }
  ];
  
  sortingMethodSelect.innerHTML = '';
  sortingMethods.forEach(method => {
    const option = document.createElement('option');
    option.value = method.value;
    option.textContent = method.label;
    sortingMethodSelect.appendChild(option);
  });
}

init();

async function renderAtlas(packedRects, images, atlasSize) {
  console.log('Rendering atlas with:', { packedRects, images, atlasSize });
  const canvas = new OffscreenCanvas(atlasSize, atlasSize);
  const ctx = canvas.getContext('2d');

  ctx.clearRect(0, 0, atlasSize, atlasSize);

  for (const rect of packedRects) {
    console.log('Processing rect:', rect);
    if (!rect || !rect.data || !rect.data.buffer) {
      console.error('Invalid rect or missing buffer:', rect);
      continue;
    }
    try {
      const img = await createImageBitmap(new Blob([rect.data.buffer]));
      ctx.drawImage(img, rect.x, rect.y, rect.width, rect.height);
    } catch (error) {
      console.error('Error rendering image in atlas:', error);
    }
  }

  return canvas.convertToBlob({ type: 'image/png' }).then(blob => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  });
}

const BASE_SIZE = 1024;
let atlasZoom = 1;
let isDragging = false;
let lastX, lastY;
let canvasOffsetX = 0;
let canvasOffsetY = 0;

function updatePreview(dataUrl) {
  const img = new Image();
  img.onload = () => {
    const scaledSize = Math.ceil(BASE_SIZE * atlasZoom);
    
    previewCanvas.width = scaledSize;
    previewCanvas.height = scaledSize;
    
    ctx.clearRect(0, 0, scaledSize, scaledSize);
    
    // Draw checkerboard background to show transparency
    const tileSize = Math.max(1, Math.ceil(10 * atlasZoom));
    for (let x = 0; x < scaledSize; x += tileSize) {
      for (let y = 0; y < scaledSize; y += tileSize) {
        ctx.fillStyle = (Math.floor(x / tileSize) + Math.floor(y / tileSize)) % 2 === 0 ? '#FFF' : '#DDD';
        ctx.fillRect(x, y, tileSize, tileSize);
      }
    }
    
    // Draw the atlas image
    ctx.drawImage(img, 0, 0, img.width, img.height, 0, 0, scaledSize, scaledSize);

    // Update canvas container size
    updateCanvasContainerSize();
    
    // Apply the current offset
    applyCanvasOffset();
  };
  img.onerror = (error) => {
    console.error('Error loading preview image:', error);
  };
  img.src = dataUrl;
}

function applyCanvasOffset() {
  previewCanvas.style.transform = `translate(${canvasOffsetX}px, ${canvasOffsetY}px)`;
}

canvasContainer.addEventListener('mousedown', (event) => {
  isDragging = true;
  lastX = event.clientX;
  lastY = event.clientY;
  canvasContainer.style.cursor = 'grabbing';
});

document.addEventListener('mousemove', (event) => {
  if (isDragging) {
    const deltaX = event.clientX - lastX;
    const deltaY = event.clientY - lastY;
    canvasOffsetX += deltaX;
    canvasOffsetY += deltaY;
    applyCanvasOffset();
    lastX = event.clientX;
    lastY = event.clientY;
  }
});

document.addEventListener('mouseup', () => {
  isDragging = false;
  canvasContainer.style.cursor = 'grab';
});

// Prevent default drag behavior on the canvas
previewCanvas.addEventListener('dragstart', (event) => {
  event.preventDefault();
});

// Initialize zoom
window.electronAPI.getAtlasZoom().then(zoom => {
  atlasZoom = zoom;
  updateAtlasZoom(atlasZoom);
});

function formatFileSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  else if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  else return (bytes / 1048576).toFixed(1) + ' MB';
}

function applyTheme(isDark) {
  document.body.classList.toggle('dark-mode', isDark);
}

// Make sure to call updateAtlas when the page loads if there are images
if (imageFiles.length > 0) {
  updateAtlas();
}

// Add this near the other event listeners
canvasContainer.addEventListener('wheel', (event) => {
  if (event.ctrlKey) {
    event.preventDefault();
    const delta = event.deltaY > 0 ? -0.1 : 0.1;
    const rect = canvasContainer.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width;
    const y = (event.clientY - rect.top) / rect.height;
    updateAtlasZoom(atlasZoom + delta, { x, y });
  }
});

async function updateAtlasZoom(newZoom, zoomCenter = { x: 0.5, y: 0.5 }) {
  const oldZoom = atlasZoom;
  atlasZoom = Math.max(0.1, Math.min(5, newZoom));
  await window.electronAPI.setAtlasZoom(atlasZoom);

  if (packedAtlasDataUrl) {
    updatePreview(packedAtlasDataUrl);
  }

  // Adjust offset to keep the zoom center in place
  const scaleFactor = atlasZoom / oldZoom;
  const containerRect = canvasContainer.getBoundingClientRect();
  const centerX = containerRect.width * zoomCenter.x;
  const centerY = containerRect.height * zoomCenter.y;
  canvasOffsetX = (canvasOffsetX - centerX) * scaleFactor + centerX;
  canvasOffsetY = (canvasOffsetY - centerY) * scaleFactor + centerY;
  applyCanvasOffset();
}

function updateCanvasContainerSize() {
  const scaledSize = Math.ceil(BASE_SIZE * atlasZoom);
  canvasContainer.style.width = `${BASE_SIZE}px`;
  canvasContainer.style.height = `${BASE_SIZE}px`;
  previewCanvas.style.width = `${scaledSize}px`;
  previewCanvas.style.height = `${scaledSize}px`;
}

// Add this near the other event listeners
saveAtlasBtn.addEventListener('click', async () => {
  if (packedAtlasDataUrl) {
    try {
      const defaultPath = 'texture_atlas.png';
      const savedPath = await window.electronAPI.saveAtlas({ dataUrl: packedAtlasDataUrl, defaultPath });
      if (savedPath) {
        alert(`Atlas saved successfully to: ${savedPath}`);
      }
    } catch (error) {
      console.error('Error saving atlas:', error);
      alert('Error saving atlas: ' + error.message);
    }
  } else {
    alert('No atlas to save. Please generate an atlas first.');
  }
});