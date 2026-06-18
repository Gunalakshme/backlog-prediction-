import chrome from 'selenium-webdriver/chrome.js';

export const config = {
  baseUrl: 'http://localhost:5173',
  timeout: 80000,
  implicitWait: 5000,
};

export const getChromeOptions = () => {
  const options = new chrome.Options();
  options.addArguments('--headless=new');
  options.addArguments('--disable-gpu');
  options.addArguments('--window-size=1920,1080');
  options.addArguments('--no-sandbox');
  options.addArguments('--disable-dev-shm-usage');
  return options;
};
