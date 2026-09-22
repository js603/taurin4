use serde::{Deserialize, Serialize};

pub const CHARACTER_SCHEMA_VERSION: u32 = 1;
pub const WORLD_SCHEMA_VERSION: u32 = 1;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ItemStack {
    pub item_id: String,
    pub quantity: u32,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct CharacterPassport {
    pub schema_version: u32,
    pub character_id: String,
    pub display_name: String,
    pub level: u32,
    pub xp: u64,
    pub copper: u64,
    pub inventory: Vec<ItemStack>,
}

impl CharacterPassport {
    pub fn validate(&self) -> Result<(), &'static str> {
        if self.schema_version != CHARACTER_SCHEMA_VERSION {
            return Err("unsupported character schema");
        }
        if self.character_id.trim().is_empty() {
            return Err("character id is required");
        }
        if self.display_name.trim().is_empty() {
            return Err("display name is required");
        }
        if self.level == 0 || self.level > 999 {
            return Err("character level is out of range");
        }
        if self
            .inventory
            .iter()
            .any(|stack| stack.item_id.trim().is_empty() || stack.quantity == 0)
        {
            return Err("invalid inventory stack");
        }
        Ok(())
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct WorldSave {
    pub schema_version: u32,
    pub world_id: String,
    pub revision: u64,
    pub world_seed: u64,
    pub world_minutes: u64,
}

impl WorldSave {
    pub fn validate(&self) -> Result<(), &'static str> {
        if self.schema_version != WORLD_SCHEMA_VERSION {
            return Err("unsupported world schema");
        }
        if self.world_id.trim().is_empty() {
            return Err("world id is required");
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn portable_character_and_host_world_are_separate_documents() {
        let character = CharacterPassport {
            schema_version: CHARACTER_SCHEMA_VERSION,
            character_id: "js-001".into(),
            display_name: "JS".into(),
            level: 27,
            xp: 12_345,
            copper: 1_842,
            inventory: vec![ItemStack {
                item_id: "grey_wolf_hide".into(),
                quantity: 2,
            }],
        };
        let world = WorldSave {
            schema_version: WORLD_SCHEMA_VERSION,
            world_id: "home-world".into(),
            revision: 8,
            world_seed: 42,
            world_minutes: 18 * 60 + 42,
        };

        assert!(character.validate().is_ok());
        assert!(world.validate().is_ok());
        assert_ne!(character.character_id, world.world_id);
    }

    #[test]
    fn rejects_impossible_local_character_data_before_host_import() {
        let character = CharacterPassport {
            schema_version: CHARACTER_SCHEMA_VERSION,
            character_id: "tampered".into(),
            display_name: "JS".into(),
            level: 99_999,
            xp: 0,
            copper: 0,
            inventory: vec![],
        };

        assert!(character.validate().is_err());
    }
}
