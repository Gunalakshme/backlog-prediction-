import { Builder } from 'selenium-webdriver';
import chromedriver from 'chromedriver';
import chrome from 'selenium-webdriver/chrome.js';
import { config, getChromeOptions } from '../config/config.js';
import { ExcelReporter } from '../utils/excelReporter.js';

export const reporter = new ExcelReporter();
export let driver;

let isInitialized = false;

before(async function () {
  if (isInitialized) return;
  isInitialized = true;
  this.timeout(80000);
  const service = new chrome.ServiceBuilder(chromedriver.path);
  driver = await new Builder()
    .forBrowser('chrome')
    .setChromeOptions(getChromeOptions())
    .setChromeService(service)
    .build();
  await driver.manage().setTimeouts({ implicit: config.implicitWait });
});

after(async function () {
  this.timeout(80000);
  if (driver) {
    await driver.quit();
  }
  await reporter.generateReport();
});
