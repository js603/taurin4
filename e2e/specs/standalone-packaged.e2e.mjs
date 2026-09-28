import { mkdirSync } from "node:fs";
import path from "node:path";

const artifactsDir = path.resolve(process.cwd(), "artifacts-packaged-standalone");
mkdirSync(artifactsDir, { recursive: true });

async function bodyText() {
  return await $("body").getText();
}

async function waitForText(text, timeout = 30000) {
  await browser.waitUntil(async () => (await bodyText()).includes(text), {
    timeout,
    timeoutMsg: "Timed out waiting for text: " + text,
  });
}

async function clickButtonContaining(label) {
  const button = await $(`//button[contains(normalize-space(.), "${label}")]`);
  await button.waitForDisplayed({ timeout: 15000 });
  await button.click();
}

async function ensureCharacter(name) {
  if ((await bodyText()).includes(name)) return;

  const nameInput = await $(
    '//label[.//span[normalize-space(.)="NAME"]]//input',
  );
  await nameInput.waitForDisplayed({ timeout: 15000 });
  await nameInput.setValue(name);

  await clickButtonContaining("스탯 굴리기");
  await waitForText("MAX HP", 15000);
  await clickButtonContaining("생성");
  await waitForText(name, 15000);
}

describe("taurin4 packaged Windows standalone acceptance", () => {
  it("starts the embedded authoritative OpenMMO core from the installed app UI", async () => {
    await waitForText("Singleplayer", 30000);
    await browser.saveScreenshot(
      path.join(artifactsDir, "01-packaged-entry.png"),
    );

    await clickButtonContaining("Singleplayer");
    await waitForText("Character Lobby", 60000);
    await waitForText("STANDALONE · EMBEDDED AUTHORITATIVE CORE", 15000);

    const character = "PackagedMira";
    await ensureCharacter(character);
    await browser.saveScreenshot(
      path.join(artifactsDir, "02-packaged-character-lobby.png"),
    );

    const enter = await $(`button[aria-label="Enter character ${character}"]`);
    await enter.waitForDisplayed({ timeout: 15000 });
    await enter.click();

    await waitForText("OPENMMO · AUTHORITATIVE WORLD", 30000);
    await waitForText("SERVER AUTHORITATIVE", 15000);
    await browser.saveScreenshot(
      path.join(artifactsDir, "03-packaged-authoritative-world.png"),
    );

    const text = await bodyText();
    if (text.includes("embedded OpenMMO core is not linked")) {
      throw new Error("Packaged executable was built without embedded-openmmo");
    }
  });
});
