import { By } from 'selenium-webdriver';
import { BasePage } from './BasePage.js';

export class LoginPage extends BasePage {
  constructor(driver) {
    super(driver);
    this.usernameInput = By.xpath("//input[@placeholder='Enter your registered username...']");
    this.passwordInput = By.xpath("//input[@placeholder='••••••••']");
    this.loginBtn = By.xpath("//button[contains(., 'Login to Console')]");
    this.errorMsg = By.xpath("//p[contains(., 'Username not found')]");
    this.header = By.xpath("//h1[contains(., 'Arrear Predictor')]");
  }

  async login(username, password) {
    await this.type(this.usernameInput, username);
    await this.type(this.passwordInput, password);
    await this.click(this.loginBtn);
  }

  async isHeaderVisible() {
    return await this.isDisplayed(this.header);
  }

  async isErrorVisible() {
    return await this.isDisplayed(this.errorMsg);
  }
}
