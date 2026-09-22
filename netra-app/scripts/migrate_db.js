const fs = require('fs');
const path = require('path');

const DB_FILE_PATH = path.join(process.cwd(), 'db.json');
const IMAGES_DIR = path.join(process.cwd(), 'data', 'images');

if (!fs.existsSync(IMAGES_DIR)) {
  fs.mkdirSync(IMAGES_DIR, { recursive: true });
}

function extractBase64AndSave(base64Data, prefix) {
  if (!base64Data || typeof base64Data !== 'string') return base64Data;
  if (base64Data.startsWith('/api/images/')) return base64Data;
  if (base64Data.startsWith('http')) return base64Data;
  
  // Only process if it looks like base64
  if (base64Data.length < 500) return base64Data;

  let data = base64Data;
  let ext = 'jpg';

  if (base64Data.startsWith('data:image')) {
    const matches = base64Data.match(/^data:(image\/\w+);base64,(.+)$/);
    if (matches && matches.length === 3) {
      ext = matches[1].split('/')[1] === 'png' ? 'png' : 'jpg';
      data = matches[2];
    }
  }

  try {
    const buffer = Buffer.from(data, 'base64');
    const filename = `${prefix}_${Date.now()}.${ext}`;
    fs.writeFileSync(path.join(IMAGES_DIR, filename), buffer);
    return `/api/images/${filename}`;
  } catch (err) {
    console.error('Failed to save image', err);
    return base64Data;
  }
}

function migrate() {
  console.log(`Loading database from ${DB_FILE_PATH}...`);
  if (!fs.existsSync(DB_FILE_PATH)) {
    console.log('No db.json found. Nothing to migrate.');
    return;
  }

  const raw = fs.readFileSync(DB_FILE_PATH, 'utf8');
  const sizeMbBefore = (raw.length / 1024 / 1024).toFixed(2);
  console.log(`Current DB size: ${sizeMbBefore} MB`);

  const db = JSON.parse(raw);
  const cases = db.cases || {};
  let modifiedCount = 0;

  for (const [id, c] of Object.entries(cases)) {
    let modified = false;

    if (c.imageUrl && c.imageUrl.length > 500) {
      c.imageUrl = extractBase64AndSave(c.imageUrl, `${id}_original`);
      modified = true;
    }
    
    if (c.result) {
      if (c.result.preprocessedImage && c.result.preprocessedImage.length > 500) {
        c.result.preprocessedImage = extractBase64AndSave(c.result.preprocessedImage, `${id}_preprocessed`);
        modified = true;
      }
      if (c.result.gradcamOverlay && c.result.gradcamOverlay.length > 500) {
        c.result.gradcamOverlay = extractBase64AndSave(c.result.gradcamOverlay, `${id}_gradcam`);
        modified = true;
      }
    }

    if (modified) {
      modifiedCount++;
      console.log(`Migrated case: ${id}`);
    }
  }

  if (modifiedCount > 0) {
    console.log(`Saving updated database (${modifiedCount} cases modified)...`);
    const newJson = JSON.stringify(db, null, 2);
    fs.writeFileSync(DB_FILE_PATH, newJson, 'utf8');
    const sizeMbAfter = (newJson.length / 1024 / 1024).toFixed(2);
    console.log(`New DB size: ${sizeMbAfter} MB`);
    console.log('Migration complete!');
  } else {
    console.log('No base64 images found to migrate.');
  }
}

migrate();
