import { Builder, By, until } from 'selenium-webdriver';
import chrome from 'selenium-webdriver/chrome.js';
import chromedriver from 'chromedriver';
import ExcelJS from 'exceljs';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import assert from 'assert';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Headless Chrome Options configuration
const options = new chrome.Options();
options.addArguments('--headless=new');
options.addArguments('--disable-gpu');
options.addArguments('--window-size=1920,1080');
options.addArguments('--no-sandbox');
options.addArguments('--disable-dev-shm-usage');

describe('Arrear Predictor & Exam Planner End-to-End Tests', function () {
  this.timeout(80000); // 80 seconds timeout for Selenium workflows
  let driver;
  const baseUrl = 'http://localhost:5173';
  const testResults = [];

  before(async function () {
    const service = new chrome.ServiceBuilder(chromedriver.path);
    driver = await new Builder()
      .forBrowser('chrome')
      .setChromeOptions(options)
      .setChromeService(service)
      .build();
    await driver.manage().setTimeouts({ implicit: 5000 });
  });

  async function forceLogout() {
    try {
      await driver.executeScript(`
        localStorage.removeItem('ap_currentUser');
        localStorage.removeItem('ap_selectedStudentId');
      `);
    } catch (e) {}
    await driver.get(baseUrl);
    await driver.sleep(800);
  }

  beforeEach(async function () {
    await driver.get(baseUrl);
    await driver.sleep(400);
    await forceLogout();
  });

  after(async function () {
    if (driver) {
      await driver.quit();
    }

    // Generate Excel report using ExcelJS
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('E2E Test Results');

    sheet.columns = [
      { header: 'Test Case Name', key: 'name', width: 65 },
      { header: 'Status', key: 'status', width: 15 },
      { header: 'Duration (ms)', key: 'duration', width: 18 },
      { header: 'Error Message', key: 'error', width: 65 }
    ];

    testResults.forEach(r => {
      sheet.addRow(r);
    });

    // Formatting workbook headers
    sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    sheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF13483B' } // Matching #13483B brand color
    };

    // Styling cells and adding coloring for Passed/Failed status
    sheet.eachRow((row, rowNumber) => {
      row.eachCell(cell => {
        cell.border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' }
        };
        cell.alignment = { vertical: 'middle', horizontal: 'left' };
        
        if (cell.value === 'PASSED') {
          cell.font = { color: { argb: 'FF2F7A4D' }, bold: true };
        } else if (cell.value === 'FAILED') {
          cell.font = { color: { argb: 'FFB23A2C' }, bold: true };
        }
      });
    });

    const reportPath = path.join(__dirname, 'test_report.xlsx');
    await workbook.xlsx.writeFile(reportPath);
    console.log(`Excel report successfully written to: ${reportPath}`);

    const p1 = 'C:\\Users\\Guna\\AppData\\Local\\Programs\\Python\\Python313\\test_report.xlsx';
    const p2 = 'C:\\Users\\Guna\\.gemini\\antigravity-ide\\brain\\ffe932cb-926d-4dcb-9701-5b6e9404bfec\\test_report.xlsx';
    
    for (const p of [p1, p2]) {
      try {
        await workbook.xlsx.writeFile(p);
        console.log(`Excel report persisted to: ${p}`);
      } catch (e) {
        console.error(`Failed to write to ${p}: ${e.message}`);
      }
    }
  });

  afterEach(async function () {
    const duration = this.currentTest.duration || 0;
    const status = this.currentTest.state === 'passed' ? 'PASSED' : 'FAILED';
    const errorMsg = this.currentTest.err ? this.currentTest.err.message : '';

    testResults.push({
      name: this.currentTest.title,
      status: status,
      duration: duration,
      error: errorMsg
    });

    if (status === 'FAILED') {
      const screenshotDir = path.join(__dirname, 'screenshots');
      if (!fs.existsSync(screenshotDir)) {
        fs.mkdirSync(screenshotDir, { recursive: true });
      }
      const cleanName = this.currentTest.title.replace(/[^a-z0-9]/gi, '_').toLowerCase();
      const screenshotPath = path.join(screenshotDir, `${cleanName}_failure.png`);
      try {
        const image = await driver.takeScreenshot();
        fs.writeFileSync(screenshotPath, image, 'base64');
        console.log(`Failure screenshot saved to: ${screenshotPath}`);

        // Persist to brain screenshots folder
        const brainScreenshotDir = 'C:\\Users\\Guna\\.gemini\\antigravity-ide\\brain\\ffe932cb-926d-4dcb-9701-5b6e9404bfec\\screenshots';
        if (!fs.existsSync(brainScreenshotDir)) {
          fs.mkdirSync(brainScreenshotDir, { recursive: true });
        }
        const brainScreenshotPath = path.join(brainScreenshotDir, `${cleanName}_failure.png`);
        fs.writeFileSync(brainScreenshotPath, image, 'base64');
        console.log(`Failure screenshot persisted to brain: ${brainScreenshotPath}`);
      } catch (err) {
        console.error('Failed to take screenshot on failure:', err);
      }
    }
  });

  // Helper function to set values on range, number, or text inputs in React
  async function setValue(element, value) {
    await driver.executeScript(
      `const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
       nativeInputValueSetter.call(arguments[0], arguments[1]);
       arguments[0].dispatchEvent(new Event('input', { bubbles: true }));
       arguments[0].dispatchEvent(new Event('change', { bubbles: true }));`,
      element, value
    );
    await driver.sleep(800);
  }

  it('1. Application loads successfully and home page renders correctly', async function () {
    await driver.get(baseUrl);
    
    // Title match
    const title = await driver.getTitle();
    assert.strictEqual(title, 'arrear-predictor-app');

    // Header title
    const heading = await driver.findElement(By.xpath("//h1[contains(., 'Arrear Predictor')]"));
    assert.ok(await heading.isDisplayed());

    // Navigation Tabs check
    const signInTab = await driver.findElement(By.xpath("//button[text()='Sign In']"));
    const createAccountTab = await driver.findElement(By.xpath("//button[text()='Create Account']"));
    assert.ok(await signInTab.isDisplayed());
    assert.ok(await createAccountTab.isDisplayed());

    // Login form fields check
    const usernameInput = await driver.findElement(By.xpath("//input[@placeholder='Enter your registered username...']"));
    const passwordInput = await driver.findElement(By.xpath("//input[@placeholder='••••••••']"));
    assert.ok(await usernameInput.isDisplayed());
    assert.ok(await passwordInput.isDisplayed());
  });

  it('2. Invalid login validation works correctly', async function () {
    await driver.get(baseUrl);

    const usernameInput = await driver.findElement(By.xpath("//input[@placeholder='Enter your registered username...']"));
    const passwordInput = await driver.findElement(By.xpath("//input[@placeholder='••••••••']"));
    const loginBtn = await driver.findElement(By.xpath("//button[contains(., 'Login to Console')]"));

    await usernameInput.clear();
    await usernameInput.sendKeys('invalid_username');
    await passwordInput.clear();
    await passwordInput.sendKeys('wrong_password');
    await loginBtn.click();

    const errorMsg = await driver.findElement(By.xpath("//p[contains(., 'Username not found')]"));
    assert.ok(await errorMsg.isDisplayed());
  });

  it('3. Admin login, seeding demo data, and global template navigation works', async function () {
    await driver.get(baseUrl);

    const usernameInput = await driver.findElement(By.xpath("//input[@placeholder='Enter your registered username...']"));
    const passwordInput = await driver.findElement(By.xpath("//input[@placeholder='••••••••']"));
    const loginBtn = await driver.findElement(By.xpath("//button[contains(., 'Login to Console')]"));

    await usernameInput.clear();
    await usernameInput.sendKeys('admin');
    await passwordInput.clear();
    await passwordInput.sendKeys('admin123');
    await loginBtn.click();

    // Verify Admin Portal Loads
    const adminHeader = await driver.findElement(By.xpath("//h2[contains(., 'System Administrator Console')]"));
    assert.ok(await adminHeader.isDisplayed());

    // Click Seed Data
    const seedBtn = await driver.findElement(By.xpath("//button[contains(., 'Seed CSE/ECE/ME Demo Data')]"));
    await seedBtn.click();
    await driver.sleep(1200);

    // Verify Subject Templates are populated
    const dsTemplate = await driver.findElement(By.xpath("//span[contains(., 'Data Structures')]"));
    assert.ok(await dsTemplate.isDisplayed());

    // Verify User Account Directory is populated
    const aliceUser = await driver.findElement(By.xpath("//td[text()='alice_cse']"));
    assert.ok(await aliceUser.isDisplayed());

    // Exit console without clearing database from localStorage
    await forceLogout();
  });

  it('4. Student login, editing academic profile details, and range slider validation works', async function () {
    await driver.get(baseUrl);

    const usernameInput = await driver.findElement(By.xpath("//input[@placeholder='Enter your registered username...']"));
    const passwordInput = await driver.findElement(By.xpath("//input[@placeholder='••••••••']"));
    const loginBtn = await driver.findElement(By.xpath("//button[contains(., 'Login to Console')]"));

    await usernameInput.clear();
    await usernameInput.sendKeys('alice_cse');
    await passwordInput.clear();
    await passwordInput.sendKeys('password123');
    await loginBtn.click();
    await driver.wait(until.elementLocated(By.xpath("//span[contains(., 'Your Academic Profile')]")), 10000);
    await driver.sleep(1200);

    // Verify profile loads
    const profileHeading = await driver.findElement(By.xpath("//span[contains(., 'Your Academic Profile')]"));
    assert.ok(await profileHeading.isDisplayed());

    const cgpaInput = await driver.findElement(By.xpath("//span[text()='Previous CGPA']/following-sibling::input"));
    const arrearsInput = await driver.findElement(By.xpath("//span[text()='Existing arrears']/following-sibling::input"));

    assert.strictEqual(await cgpaInput.getAttribute('value'), '8.2');
    assert.strictEqual(await arrearsInput.getAttribute('value'), '0');

    // Update CGPA and Arrears
    await setValue(cgpaInput, '7.6');
    await setValue(arrearsInput, '1');

    assert.strictEqual(await cgpaInput.getAttribute('value'), '7.6');
    assert.strictEqual(await arrearsInput.getAttribute('value'), '1');

    // Check Data Structures subject card
    const dsCard = await driver.findElement(By.xpath("//span[text()='Data Structures']/ancestor::div[contains(@class, 'rounded-xl')]"));
    const dsCardRisk = await dsCard.findElement(By.xpath(".//span[contains(@style, 'background')][2]"));
    const initialRisk = await dsCardRisk.getText();

    // Slide attendance to 10% (should change risk and bypass prep floor)
    const attSlider = await dsCard.findElement(By.xpath(".//input[@type='range'][1]"));
    await setValue(attSlider, '10');

    const updatedRisk = await dsCardRisk.getText();
    console.log(`Student E2E: Data Structures risk changed from ${initialRisk} to ${updatedRisk}`);
    assert.notStrictEqual(initialRisk, updatedRisk);

    // Edit internal marks
    const internalsInput = await dsCard.findElement(By.xpath(".//input[@type='number'][1]"));
    await setValue(internalsInput, '12');

    // Log out without clearing database
    await forceLogout();
  });

  it('5. Student profile input boundary checks work correctly', async function () {
    await driver.get(baseUrl);

    const usernameInput = await driver.findElement(By.xpath("//input[@placeholder='Enter your registered username...']"));
    const passwordInput = await driver.findElement(By.xpath("//input[@placeholder='••••••••']"));
    const loginBtn = await driver.findElement(By.xpath("//button[contains(., 'Login to Console')]"));

    await usernameInput.clear();
    await usernameInput.sendKeys('alice_cse');
    await passwordInput.clear();
    await passwordInput.sendKeys('password123');
    await loginBtn.click();
    await driver.wait(until.elementLocated(By.xpath("//span[contains(., 'Your Academic Profile')]")), 10000);
    await driver.sleep(1200);

    const cgpaInput = await driver.findElement(By.xpath("//span[text()='Previous CGPA']/following-sibling::input"));
    const arrearsInput = await driver.findElement(By.xpath("//span[text()='Existing arrears']/following-sibling::input"));

    // Enter CGPA = 15 (should clamp to 10)
    await setValue(cgpaInput, '15');
    assert.strictEqual(await cgpaInput.getAttribute('value'), '10');

    // Enter negative arrears = -10 (should clamp to 0)
    await setValue(arrearsInput, '-10');
    assert.strictEqual(await arrearsInput.getAttribute('value'), '0');

    // Exit without clearing database
    await forceLogout();
  });

  it('6. Student planner time logging and checkbox task mitigation works', async function () {
    await driver.get(baseUrl);

    const usernameInput = await driver.findElement(By.xpath("//input[@placeholder='Enter your registered username...']"));
    const passwordInput = await driver.findElement(By.xpath("//input[@placeholder='••••••••']"));
    const loginBtn = await driver.findElement(By.xpath("//button[contains(., 'Login to Console')]"));

    await usernameInput.clear();
    await usernameInput.sendKeys('alice_cse');
    await passwordInput.clear();
    await passwordInput.sendKeys('password123');
    await loginBtn.click();
    await driver.wait(until.elementLocated(By.xpath("//span[contains(., 'Your Academic Profile')]")), 10000);
    await driver.sleep(1200);

    // Select Study Planner Tab
    const plannerTab = await driver.findElement(By.xpath("//button[contains(., 'Exam Study Planner')]"));
    await plannerTab.click();
    await driver.sleep(600);

    // Locate Data Structures Card in Planner Mode
    const dsPlannerCard = await driver.findElement(By.xpath("//h3[text()='Data Structures']/ancestor::div[contains(@class, 'rounded-xl')]"));
    
    // Log Hours & Minutes
    const hrsInput = await dsPlannerCard.findElement(By.xpath(".//input[@type='number'][1]"));
    const minsInput = await dsPlannerCard.findElement(By.xpath(".//input[@type='number'][2]"));

    await setValue(hrsInput, '6');
    await setValue(minsInput, '40');

    assert.strictEqual(await hrsInput.getAttribute('value'), '6');
    assert.strictEqual(await minsInput.getAttribute('value'), '40');

    // Click checkbox to toggle syllabus topic task
    const checkItem = await dsPlannerCard.findElement(By.xpath(".//input[@type='checkbox'][1]"));
    const wasChecked = await checkItem.isSelected();
    await checkItem.click();
    await driver.sleep(600);
    
    assert.notStrictEqual(wasChecked, await checkItem.isSelected());

    // Exit without clearing database
    await forceLogout();
  });

  it('7. Staff login, student roster inspection, and syllabus templates manager functions correctly', async function () {
    await driver.get(baseUrl);

    const usernameInput = await driver.findElement(By.xpath("//input[@placeholder='Enter your registered username...']"));
    const passwordInput = await driver.findElement(By.xpath("//input[@placeholder='••••••••']"));
    const loginBtn = await driver.findElement(By.xpath("//button[contains(., 'Login to Console')]"));

    await usernameInput.clear();
    await usernameInput.sendKeys('sarah_cse');
    await passwordInput.clear();
    await passwordInput.sendKeys('password123');
    await loginBtn.click();
    await driver.wait(until.elementLocated(By.xpath("//h2[contains(., 'Student Tracking Roster')]")), 10000);
    await driver.sleep(1200);

    // Check staff roster loads
    const rosterHeader = await driver.findElement(By.xpath("//h2[contains(., 'Student Tracking Roster')]"));
    assert.ok(await rosterHeader.isDisplayed());

    // Inspect performance for Bob Johnson
    const inspectBtn = await driver.findElement(By.xpath("//tr[td[contains(., 'Bob Johnson')]]//button[contains(., 'Inspect Performance')]"));
    await inspectBtn.click();
    await driver.sleep(1000);

    // Verify inspect banner
    const monitorBanner = await driver.findElement(By.xpath("//h2[contains(., 'Monitoring Student: Bob Johnson')]"));
    assert.ok(await monitorBanner.isDisplayed());

    // Go back
    const backBtn = await driver.findElement(By.xpath("//button[contains(., 'Back to Directory')]"));
    await backBtn.click();
    await driver.sleep(600);

    // Switch to Curriculum tab
    const curriculumTab = await driver.findElement(By.xpath("//button[contains(., 'Curriculum & Syllabus Manager')]"));
    await curriculumTab.click();
    await driver.sleep(600);

    const curriculumHeader = await driver.findElement(By.xpath("//h2[contains(., 'Master Subjects & Syllabus Checklist')]"));
    assert.ok(await curriculumHeader.isDisplayed());

    // Add subject
    const addSubjectBtn = await driver.findElement(By.xpath("//button[contains(., 'Add Subject Course')]"));
    await addSubjectBtn.click();
    await driver.sleep(800);

    // Verify course added with default name "New Syllabus Course"
    const newCourseInput = await driver.findElement(By.xpath("//input[@value='New Syllabus Course']"));
    assert.ok(await newCourseInput.isDisplayed());

    // Exit without clearing database
    await forceLogout();
  });

  it('8. Custom registration workflow creates a functional student profile', async function () {
    await driver.get(baseUrl);

    const createTab = await driver.findElement(By.xpath("//button[text()='Create Account']"));
    await createTab.click();
    await driver.sleep(500);

    const regUsername = await driver.findElement(By.xpath("//input[@placeholder='e.g. jane_doe']"));
    const regPassword = await driver.findElement(By.xpath("//input[@placeholder='Min 4 chars']"));
    const regName = await driver.findElement(By.xpath("//input[@placeholder='e.g. Jane Doe']"));
    const deptSelect = await driver.findElement(By.xpath("//select[option[@value='CSE']]"));
    const rollInput = await driver.findElement(By.xpath("//input[@placeholder='e.g. CSE-2026-44']"));
    const registerBtn = await driver.findElement(By.xpath("//button[contains(., 'Create Account & Login')]"));

    await regUsername.sendKeys('custom_jane');
    await regPassword.sendKeys('pass456');
    await regName.sendKeys('Jane Doe Custom');
    
    // Select ECE department
    await deptSelect.click();
    const eceOption = await driver.findElement(By.xpath("//option[@value='ECE']"));
    await eceOption.click();

    await rollInput.sendKeys('ECE-2026-987');
    await registerBtn.click();
    await driver.sleep(1500);

    // Check signed in automatically
    const loggedUserBadge = await driver.findElement(By.xpath("//span[contains(., 'Jane Doe Custom')]"));
    assert.ok(await loggedUserBadge.isDisplayed());

    const deptBadge = await driver.findElement(By.xpath("//span[contains(., '(ECE)')]"));
    assert.ok(await deptBadge.isDisplayed());

    // Exit without clearing database
    await forceLogout();
  });

  it('9. Login with gunalakshme credentials works and displays student profile', async function () {
    await driver.get(baseUrl);

    const usernameInput = await driver.findElement(By.xpath("//input[@placeholder='Enter your registered username...']"));
    const passwordInput = await driver.findElement(By.xpath("//input[@placeholder='••••••••']"));
    const loginBtn = await driver.findElement(By.xpath("//button[contains(., 'Login to Console')]"));

    await usernameInput.clear();
    await usernameInput.sendKeys('gunalakshme');
    await passwordInput.clear();
    await passwordInput.sendKeys('guna@2323');
    await loginBtn.click();
    await driver.wait(until.elementLocated(By.xpath("//span[contains(., 'Your Academic Profile')]")), 10000);
    await driver.sleep(1200);

    const loggedUserBadge = await driver.findElement(By.xpath("//span[contains(., 'Gunalakshme P')]"));
    assert.ok(await loggedUserBadge.isDisplayed());

    // Exit without clearing database
    await forceLogout();
  });
});
