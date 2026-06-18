import { By, until } from 'selenium-webdriver';

export class BasePage {
  constructor(driver) {
    this.driver = driver;
  }

  async navigate(url) {
    await this.driver.get(url);
  }

  async click(locator) {
    const el = await this.driver.wait(until.elementLocated(locator), 5000);
    await el.click();
  }

  async type(locator, text) {
    const el = await this.driver.wait(until.elementLocated(locator), 5000);
    await el.clear();
    await el.sendKeys(text);
  }

  async getText(locator) {
    const el = await this.driver.wait(until.elementLocated(locator), 5000);
    return await el.getText();
  }

  async isDisplayed(locator) {
    try {
      const el = await this.driver.wait(until.elementLocated(locator), 3000);
      return await el.isDisplayed();
    } catch {
      return false;
    }
  }
}
