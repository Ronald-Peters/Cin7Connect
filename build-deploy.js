import fs from 'fs';
import path from 'path';

// Copy built server file to the location expected by deployment
const distPath = path.resolve('dist/index.js');
const serverPath = path.resolve('server/index.js');
const publicSrc = path.resolve('dist/public');
const publicDest = path.resolve('server/public');

if (fs.existsSync(distPath)) {
  // Ensure server directory exists
  if (!fs.existsSync('server')) {
    fs.mkdirSync('server', { recursive: true });
  }
  
  // Copy the built server file
  fs.copyFileSync(distPath, serverPath);
  console.log('✅ Copied dist/index.js to server/index.js for deployment');
  
  // Copy frontend assets for deployment
  if (fs.existsSync(publicSrc)) {
    // Remove existing public directory if it exists
    if (fs.existsSync(publicDest)) {
      fs.rmSync(publicDest, { recursive: true, force: true });
    }
    
    // Copy the entire public directory
    fs.cpSync(publicSrc, publicDest, { recursive: true });
    console.log('✅ Copied dist/public to server/public for deployment');
  }
} else {
  console.error('❌ dist/index.js not found. Run npm run build first.');
  process.exit(1);
}