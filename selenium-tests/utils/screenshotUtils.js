import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const screenshotsDir = path.resolve(__dirname, '../screenshots');

export async function captureScreenshot(driver, testName) {
  if (!fs.existsSync(screenshotsDir)) {
    fs.mkdirSync(screenshotsDir, { recursive: true });
  }
  const cleanName = testName.replace(/[^a-z0-9]/gi, '_').toLowerCase().substring(0, 50);
  const fileName = `${cleanName}_failure_${Date.now()}.png`;
  const filePath = path.join(screenshotsDir, fileName);

  try {
    const image = await driver.takeScreenshot();
    fs.writeFileSync(filePath, image, 'base64');
    
    // Also save to brain directory for artifact viewing
    const brainDir = 'C:\\Users\\Guna\\.gemini\\antigravity-ide\\brain\\ffe932cb-926d-4dcb-9701-5b6e9404bfec\\screenshots';
    if (!fs.existsSync(brainDir)) fs.mkdirSync(brainDir, { recursive: true });
    fs.writeFileSync(path.join(brainDir, fileName), image, 'base64');

    return `selenium-tests/screenshots/${fileName}`; // Return relative path for report
  } catch (err) {
    console.error('Failed to capture screenshot:', err);
    return 'Capture Failed';
  }
}
