const select_folder_btn = document.getElementById("selectFolderBtn");
const add_files_btn = document.getElementById("addFilesBtn");
const atlas_size_select = document.getElementById("atlasSizeSelect");
const padding_select = document.getElementById("paddingSelect");
const sorting_method_select = document.getElementById("sortingMethodSelect");
const toggle_theme_btn = document.getElementById("toggleThemeBtn");
const file_list_container = document.getElementById("fileListContainer");
const preview_canvas = document.getElementById("previewCanvas");
const ctx = preview_canvas.getContext("2d");
const quality_select = document.getElementById("qualitySelect");
const canvas_container = document.getElementById("canvasContainer");
const atlas_format_select = document.getElementById("atlasFormat");

const save_atlas_btn = document.getElementById("saveAtlasBtn");
const save_project_btn = document.getElementById("saveProjectBtn");
const load_project_btn = document.getElementById("loadProjectBtn");
const github_btn = document.getElementById("githubBtn");

let selected_folder = null;
let added_files = null;
let image_files = [];
let packed_atlas_data_url = null;
let is_custom_sorting = false;
let packed_rects = [];
let current_atlas_size = { width: 1024, height: 1024 };

let is_dragging = false;
let last_x, last_y;
let canvas_offset_x = 0;
let canvas_offset_y = 0;

const atlas_sizes = [
	{ width: 16, height: 16 },
	{ width: 32, height: 32 },
	{ width: 64, height: 64 },
	{ width: 128, height: 64 },
	{ width: 128, height: 128 },
	{ width: 256, height: 128 },
    { width: 256, height: 256 },
	{ width: 512, height: 256 },
    { width: 512, height: 512 },
	{ width: 1024, height: 512 },
    { width: 1024, height: 1024 },
	{ width: 2048, height: 1024 },
    { width: 2048, height: 2048 },
	{ width: 4096, height: 2048 },
    { width: 4096, height: 4096 },
	{ width: 8192, height: 4096 },
    { width: 8192, height: 8192 }
];

atlas_size_select.innerHTML = ""; // Clear existing options

atlas_sizes.forEach(size => {
    const option = document.createElement("option");
    option.value = `${size.width}x${size.height}`;
    option.textContent = `${size.width} x ${size.height}`;
    if (size.width === 1024 && size.height === 1024) {
        option.selected = true; // Set 1024x1024 as the default option
    }
    atlas_size_select.appendChild(option);
});

// Event listener for selecting a folder
select_folder_btn.addEventListener("click", async () => {
	try {
		selected_folder = await window.electronAPI.select_folder();
		if (selected_folder) {
			image_files = await window.electronAPI.load_images(selected_folder, false);
			await update_file_list(); // This will sort the image_files
			update_atlas();
		}
	} catch (error) {
		alert("Error selecting folder: " + error.message);
	}
});

add_files_btn.addEventListener("click", async () => {
	try {
		added_files = await window.electronAPI.add_files();
		if (added_files) {
			const new_files = await window.electronAPI.load_image(added_files, true);
			image_files.push(...new_files);
			await update_file_list();
			update_atlas();
		}
	} catch (error) {
		alert("Error adding files: " + error.message);
	}
});

// Event listeners for atlas options
[atlas_size_select, padding_select, sorting_method_select].forEach(select => {
	select.addEventListener("change", () => {
		is_custom_sorting = sorting_method_select.value === "custom";
		update_file_list();
		update_atlas();
	});
});

// Event listener for toggling theme
toggle_theme_btn.addEventListener("click", async () => {
	const is_dark = await window.electronAPI.toggle_dark_mode();
	apply_theme(is_dark);
});

let highlighted_item = null;

async function update_file_list() {
	const sorting_method = sorting_method_select.value;

	if (sorting_method !== "custom") {
		const [method, order] = sorting_method.split("-");

		// Custom string comparison function
		const compare_strings = (a, b) => {
			const a_chars = [...a];
			const b_chars = [...b];
			for (let i = 0; i < Math.min(a_chars.length, b_chars.length); i++) {
				if (a_chars[i] !== b_chars[i]) {
					return a_chars[i].localeCompare(b_chars[i]);
				}
			}
			return a_chars.length - b_chars.length;
		};

		// Sort image_files based on the selected method
		image_files.sort((a, b) => {
			let comparison;
			switch (method) {
				case "fileSize":
					comparison = a.stats.size - b.stats.size;
					break;
				case "name":
					comparison = compare_strings(a.name, b.name);
					break;
				case "updated":
					comparison = a.stats.mtime.getTime() - b.stats.mtime.getTime();
					break;
				default:
					return 0;
			}
			// If the primary comparison results in a tie, use the name as a secondary sort
			if (comparison === 0 && method !== "name") {
				comparison = compare_strings(a.name, b.name);
			}
			return order === "asc" ? comparison : -comparison;
		});
	}

	file_list_container.innerHTML = "";
	for (const file of image_files) {
		const li = document.createElement("li");
		li.draggable = true;
		li.dataset.path = file.path;

		// Create image preview
		const img = document.createElement("img");
		const preview = await window.electronAPI.get_image_preview(file.path);
		img.src = preview.preview;
		img.alt = file.name;
		li.appendChild(img);

		// Create info container
		const info_div = document.createElement("div");
		info_div.className = "file-info";

		// File name
		const name_span = document.createElement("span");
		name_span.className = "file-name";
		name_span.textContent = file.name;
		info_div.appendChild(name_span);

		// File size
		const size_span = document.createElement("span");
		size_span.className = "file-size";
		size_span.textContent = format_file_size(file.stats.size);
		info_div.appendChild(size_span);

		li.appendChild(info_div);

		// Add delete button
		const delete_btn = document.createElement("button");
		delete_btn.className = "delete-btn";
		delete_btn.innerHTML = "&times;";
		delete_btn.addEventListener("click", (e) => {
			e.stopPropagation();
			remove_file(file.path);
		});
		li.appendChild(delete_btn);

		file_list_container.appendChild(li);

		// Add drag and drop event listeners
		li.addEventListener("dragstart", drag_start);
		li.addEventListener("dragover", drag_over);
		li.addEventListener("dragleave", drag_leave);
		li.addEventListener("drop", drop);

		// Add click event listener for highlighting
		li.addEventListener("click", () => toggle_highlight(file.path));
	}
}
function remove_file(path) {
	image_files = image_files.filter(file => file.path !== path);
	update_file_list();
	update_atlas();
}

function toggle_highlight(path) {
	// if (highlighted_item === path) {
	// 	highlighted_item = null;
	// 	update_preview_highlight();
	// } else {
	// 	highlighted_item = path;
	// 	update_preview_highlight();
	// }
}

function update_preview_highlight() {
	return;

	if (!packed_atlas_data_url) return;

	const img = new Image();
	img.onload = () => {
		const scaled_size = Math.ceil(current_atlas_size);

		preview_canvas.width = scaled_size;
		preview_canvas.height = scaled_size;

		ctx.clearRect(0, 0, scaled_size, scaled_size);

		// Draw checkerboard background
		const tile_size = Math.max(1, Math.ceil(10));
		for (let x = 0; x < scaled_size; x += tile_size) {
			for (let y = 0; y < scaled_size; y += tile_size) {
				ctx.fillStyle = (Math.floor(x / tile_size) + Math.floor(y / tile_size)) % 2 === 0 ? "#FFF" : "#DDD";
				ctx.fillRect(x, y, tile_size, tile_size);
			}
		}

		// Draw the atlas image
		ctx.drawImage(img, 0, 0, img.width, img.height, 0, 0, scaled_size, scaled_size);

		// Apply highlight effect
		if (highlighted_item) {
			const highlighted_rect = packed_rects.find(rect => rect.data.path === highlighted_item);
			if (highlighted_rect) {
				let the_atlas_size = parseInt(atlas_size_select.value);

				const { x, y, width, height } = highlighted_rect;
				let scale_factor = scaled_size / current_atlas_size;

				if (the_atlas_size == 256) {
					scale_factor *= 4;
				} else if (the_atlas_size == 512) {
					scale_factor *= 2;
				} else if (the_atlas_size == 2048) {
					scale_factor /= 2;
				} else if (the_atlas_size == 4096) {
					scale_factor /= 4;
				} else if (the_atlas_size == 8192) {
					scale_factor /= 8;
				}

				const scaled_x = x * scale_factor;
				const scaled_y = y * scale_factor;
				const scaled_width = width * scale_factor;
				const scaled_height = height * scale_factor;

				// Create a path for the entire canvas except the highlighted item
				ctx.beginPath();
				ctx.rect(0, 0, scaled_size, scaled_size);
				ctx.rect(scaled_x, scaled_y, scaled_width, scaled_height);
				ctx.closePath();

				// Set the composite operation to "source-over" to draw over the existing content
				ctx.globalCompositeOperation = "source-over";

				// Fill the path with a semi-transparent black color
				ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
				ctx.fill("evenodd");

				// Reset the composite operation
				ctx.globalCompositeOperation = "source-over";

				// Draw a border around the highlighted item
				ctx.strokeStyle = "yellow";
				ctx.lineWidth = 2;
				ctx.strokeRect(scaled_x, scaled_y, scaled_width, scaled_height);
			}
		}

		update_canvas_container_size();
	};
	img.src = packed_atlas_data_url;
}

// Modify the update_preview function to use update_preview_highlight
function update_preview(data_url) {
	packed_atlas_data_url = data_url;
	update_preview_highlight();
}

// Drag and drop functions
let dragged_item = null;

function drag_start(e) {
	if (sorting_method_select.value !== "custom") return;
	dragged_item = e.target.closest("li");
	e.dataTransfer.setData("text/plain", dragged_item.dataset.path);
	setTimeout(() => {
		dragged_item.classList.add("dragging");
	}, 0);

	// Reset highlighting when dragging starts
	if (highlighted_item) {
		highlighted_item = null;
		update_preview_highlight();
	}
}

function drag_over(e) {
	if (sorting_method_select.value !== "custom") return;
	e.preventDefault();
	const current_item = e.target.closest("li");
	if (current_item && current_item !== dragged_item) {
		const rect = current_item.getBoundingClientRect();
		const y = e.clientY - rect.top;
		if (y < rect.height / 2) {
			current_item.classList.remove("drag-over-bottom");
			current_item.classList.add("drag-over-top");
		} else {
			current_item.classList.remove("drag-over-top");
			current_item.classList.add("drag-over-bottom");
		}
	}
}

function drag_leave(e) {
	if (sorting_method_select.value !== "custom") return;
	const current_item = e.target.closest("li");
	if (current_item) {
		current_item.classList.remove("drag-over-top", "drag-over-bottom");
	}
}

function drop(e) {
	if (sorting_method_select.value !== "custom") return;
	e.preventDefault();
	const drop_target = e.target.closest("li");
	if (drop_target && dragged_item) {
		const rect = drop_target.getBoundingClientRect();
		const y = e.clientY - rect.top;
		if (y < rect.height / 2) {
			drop_target.parentNode.insertBefore(dragged_item, drop_target);
		} else {
			drop_target.parentNode.insertBefore(dragged_item, drop_target.nextSibling);
		}
		// Update image_files array to match new order
		const new_image_files = Array.from(file_list_container.children).map(li =>
			image_files.find(file => file.path === li.dataset.path)
		);
		image_files = new_image_files;
		update_atlas();
	}
	// Reset styles
	Array.from(file_list_container.children).forEach(item => {
		item.classList.remove("dragging", "drag-over-top", "drag-over-bottom");
	});
	dragged_item = null;
}

// Update the CSS for the drag and drop effect
const style = document.createElement("style");
style.textContent = `
  #fileListContainer li.drag-over-top::before,
  #fileListContainer li.drag-over-bottom::after {
    content: "";
    position: absolute;
    left: 0;
    right: 0;
    height: 2px;
    background-color: #4CAF50;
    pointer-events: none;
  }
  #fileListContainer li.drag-over-top::before {
    top: -1px;
  }
  #fileListContainer li.drag-over-bottom::after {
    bottom: -1px;
  }
`;
document.head.appendChild(style);

// Function to update the atlas
async function update_atlas() {
    if (image_files.length === 0){
		update_canvas_container_size();
		return;
	}

    try {
        const [width, height] = atlas_size_select.value.split("x").map(Number);
        current_atlas_size = { width, height };
        const padding = parseInt(padding_select.value);
        const sorting_method = sorting_method_select.value;

        const result = await window.electronAPI.pack_texture({
            image_paths: image_files.map(file => file.path),
            atlas_size: current_atlas_size,
            padding,
            sorting_method
        });

        if (!result || !result.packed_rects || result.packed_rects.length === 0) {
            throw new Error("No images were packed into the atlas");
        }

        // Create a map of path to packed rect for quick lookup
        const rect_map = new Map(result.packed_rects.map(rect => [rect.data.path, rect]));

        // Create packed_rects array in the exact order of image_files
        packed_rects = image_files.map(file => {
            const rect = rect_map.get(file.path);
            if (!rect) {
                return null;
            }
            return rect;
        }).filter(Boolean);

        // Ensure the rendering uses the packed_rects order
        packed_atlas_data_url = await render_atlas(packed_rects, current_atlas_size);
        update_preview(packed_atlas_data_url);

        // Enable the save button after successful atlas generation
        save_atlas_btn.disabled = false;
    } catch (error) {
        alert("Error updating atlas: " + error.message);

        // Disable the save button if there's an error
        save_atlas_btn.disabled = true;
    }
}

// Helper functions (render_atlas, update_preview, format_file_size, etc.) remain the same

// Initialize the application
async function init() {
	const is_dark = await window.electronAPI.get_theme();
	apply_theme(is_dark);
	update_preview("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACklEQVR4nGMAAQAABQABDQottAAAAABJRU5ErkJggg==");

	// Set initial cursor style
	canvas_container.style.cursor = "grab";

	// Update sorting method options
	const sorting_methods = [
		{ value: "name-asc", label: "Name (A-Z)" },
		{ value: "name-desc", label: "Name (Z-A)" },
		{ value: "fileSize-asc", label: "Size (Small - Large)" },
		{ value: "fileSize-desc", label: "Size (Large - Small)" },
		{ value: "updated-desc", label: "Modified (Newest - Oldest)" },
		{ value: "updated-asc", label: "Modified (Oldest - Newest)" },
		{ value: "custom", label: "Custom (Drag & Drop)" }
	];

	sorting_method_select.innerHTML = "";
	sorting_methods.forEach(method => {
		const option = document.createElement("option");
		option.value = method.value;
		option.textContent = method.label;
		sorting_method_select.appendChild(option);
	});
}
init();

async function render_atlas(packed_rects, atlas_size) {
    const canvas = new OffscreenCanvas(atlas_size.width, atlas_size.height);
    const ctx = canvas.getContext("2d");

    ctx.clearRect(0, 0, atlas_size.width, atlas_size.height);

    for (const rect of packed_rects) {
        if (!rect || !rect.data || !rect.data.buffer) {
            continue;
        }
        try {
            const img = await createImageBitmap(new Blob([rect.data.buffer]));
            ctx.drawImage(img, rect.x, rect.y, rect.width, rect.height);
        } catch (error) {

        }
    }

    return canvas.convertToBlob({ type: "image/png" }).then(blob => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    });
}

function update_preview(data_url) {
    const img = new Image();
    img.onload = () => {
        const max_width = Math.max(current_atlas_size.width, 1024);
        const max_height = Math.max(current_atlas_size.height, 1024);

        preview_canvas.width = max_width;
        preview_canvas.height = max_height;

        ctx.clearRect(0, 0, max_width, max_height);

        // Draw checkerboard background to show transparency
        const tile_size = Math.max(1, Math.ceil(10));
        for (let x = 0; x < max_width; x += tile_size) {
            for (let y = 0; y < max_height; y += tile_size) {
                ctx.fillStyle = (Math.floor(x / tile_size) + Math.floor(y / tile_size)) % 2 === 0 ? "#FFF" : "#DDD";
                ctx.fillRect(x, y, tile_size, tile_size);
            }
        }

        // Draw the atlas image
        ctx.imageSmoothingEnabled = false; // Disable image smoothing for pixel-perfect rendering
        ctx.drawImage(img, 0, 0, max_width, max_height);

        // Update canvas container size
        update_canvas_container_size();

        // Apply the current offset
        apply_canvas_offset();
    };

    img.src = data_url;
}

function update_canvas_container_size() {
	// canvas_container.style.width = `${current_atlas_size}px`;
	// canvas_container.style.height = `${current_atlas_size}px`;
	const [width, height] = atlas_size_select.value.split("x").map(Number);
	preview_canvas.style.width = `${width}px`;
	preview_canvas.style.height = `${height}px`;
}

let scale_factor = 1; // Initial scale factor

function apply_canvas_offset() {
    preview_canvas.style.transform = `translate(${canvas_offset_x}px, ${canvas_offset_y}px) scale(${scale_factor})`;
    preview_canvas.style.transformOrigin = "0 0"; // Set the origin to the top-left corner
}

// Add event listener for mouse wheel to support zoom in and out
document.addEventListener("wheel", (event) => {
    if (event.ctrlKey) {
        event.preventDefault(); // Prevent the default zoom behavior

        // Adjust the scale factor based on the scroll direction
        if (event.deltaY < 0) {
            scale_factor *= 1.1; // Zoom in
        } else {
            scale_factor /= 1.1; // Zoom out
        }

        // Apply the new scale factor
        apply_canvas_offset();
    }
});

function format_file_size(bytes) {
	if (bytes < 1024) return bytes + " B";
	else if (bytes < 1048576) return (bytes / 1024).toFixed(1) + " KB";
	else return (bytes / 1048576).toFixed(1) + " MB";
}

function apply_theme(is_dark) {
	document.body.classList.toggle("dark-mode", is_dark);
}

// Make sure to call update_atlas when the page loads if there are images
if (image_files.length > 0) {
	update_atlas();
}

save_atlas_btn.addEventListener("click", async () => {
	if (packed_atlas_data_url) {
		try {
			const default_path = `sprite_atlas.${atlas_format_select.value}`;
			const saved_path = await window.electronAPI.save_atlas({
				data_url: packed_atlas_data_url,
				default_path,
				quality: quality_select.value,
				format: atlas_format_select.value
			});
			if (saved_path) {

			}
		} catch (error) {
			alert("Error saving atlas: " + error.message);
		}
	} else {
		alert("No atlas to save. Please generate an atlas first.");
	}
});

async function save_project() {
	const project_data = {
		selected_folder,
		image_files,
		atlas_size: atlas_size_select.value,
		padding: padding_select.value,
		sorting_method: sorting_method_select.value,
		quality: quality_select.value
	};

	try {
		const saved_path = await window.electronAPI.save_project(project_data);
	} catch (error) {
		alert("Error saving project: " + error.message);
	}
}

async function load_project() {
	try {
		const project_data = await window.electronAPI.load_project();
		if (project_data) {
			image_files = project_data.image_files;
			atlas_size_select.value = project_data.atlas_size;
			padding_select.value = project_data.padding;
			sorting_method_select.value = project_data.sorting_method;
			quality_select.value = project_data.quality;

			await update_file_list();
			update_atlas();
		}
	} catch (error) {
		alert("Error loading project: " + error.message);
	}
}

save_project_btn.addEventListener("click", save_project);
load_project_btn.addEventListener("click", load_project);

github_btn.addEventListener("click", () => {
	window.electronAPI.open_external("https://github.com/CommanderFoo/sprite-packer");
});

// Add these event listeners for panning
canvas_container.addEventListener("mousedown", (event) => {
	is_dragging = true;
	last_x = event.clientX;
	last_y = event.clientY;
	canvas_container.style.cursor = "grabbing";
});

document.addEventListener("mousemove", (event) => {
	if (is_dragging) {
		const delta_x = event.clientX - last_x;
		const delta_y = event.clientY - last_y;
		canvas_offset_x += delta_x;
		canvas_offset_y += delta_y;
		apply_canvas_offset();
		last_x = event.clientX;
		last_y = event.clientY;
	}
});

document.addEventListener("mouseup", () => {
	is_dragging = false;
	canvas_container.style.cursor = "grab";
});

// Prevent default drag behavior on the canvas
preview_canvas.addEventListener("dragstart", (event) => {
	event.preventDefault();
});