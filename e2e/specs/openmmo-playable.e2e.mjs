import { mkdirSync } from "node:fs";
import path from "node:path";

const artifactsDir = path.resolve(process.cwd(), "artifacts");
mkdirSync(artifactsDir, { recursive: true });

async function bodyText() {
  return await $("body").getText();
}

async function waitForText(text, timeout = 30000) {
  await browser.waitUntil(
    async () => (await bodyText()).includes(text),
    {
      timeout,
      timeoutMsg: "Timed out waiting for text: " + text,
    },
  );
}

async function clickButtonContaining(label) {
  const button = await $(
    `//button[contains(normalize-space(.), "${label}")]`,
  );
  await button.waitForDisplayed({ timeout: 15000 });
  await button.click();
}

describe("taurin4 real OpenMMO Windows acceptance", () => {
  it("plays the seeded old_crypt encounter through the actual Tauri UI", async () => {
    await waitForText("Character Lobby", 45000);
    await waitForText("CryptMira", 15000);
    await browser.saveScreenshot(
      path.join(artifactsDir, "01-character-lobby.png"),
    );

    const cryptCard = await $(
      '//article[contains(@class,"character-card")][.//*[contains(normalize-space(.),"CryptMira")]]',
    );
    await cryptCard.waitForDisplayed({ timeout: 15000 });
    const enterButton = await cryptCard.$(
      './/button[contains(normalize-space(.),"입장")]',
    );
    await enterButton.click();

    await waitForText("OPENMMO · AUTHORITATIVE WORLD", 30000);
    await browser.saveScreenshot(
      path.join(artifactsDir, "02-game-screen.png"),
    );

    await browser.waitUntil(
      async () => {
        const text = await bodyText();
        return (
          text.includes("MONSTER") &&
          (text.includes("WORLD ENCOUNTER") ||
            text.includes("빠른 공격") ||
            text.includes("ENCOUNTER"))
        );
      },
      {
        timeout: 30000,
        timeoutMsg:
          "A real dungeon monster never reached the player-facing GameScreen",
      },
    );

    const initialEncounterText = await bodyText();
    await browser.saveScreenshot(
      path.join(artifactsDir, "03-monster-encounter.png"),
    );

    if (initialEncounterText.includes("WORLD ENCOUNTER")) {
      await clickButtonContaining("살펴본다");
    }

    await browser.waitUntil(
      async () => (await bodyText()).includes("빠른 공격"),
      {
        timeout: 15000,
        timeoutMsg: "Combat did not expose the visible basic attack control",
      },
    );

    let resolved = false;
    for (let attack = 0; attack < 10; attack += 1) {
      const text = await bodyText();
      if (text.includes("REWARD") || text.includes("처치")) {
        resolved = true;
        break;
      }

      await clickButtonContaining("빠른 공격");
      await browser.pause(1500);
    }

    if (!resolved) {
      const text = await bodyText();
      resolved = text.includes("REWARD") || text.includes("처치");
    }

    await browser.saveScreenshot(
      path.join(artifactsDir, "04-combat-result.png"),
    );

    if (!resolved) {
      throw new Error(
        "Visible attack controls did not reach an authoritative kill/reward result",
      );
    }

    const resultText = await bodyText();
    if (!resultText.includes("SERVER AUTHORITATIVE")) {
      throw new Error("GameScreen lost the server-authoritative runtime marker");
    }
  });
});
