# Dungeon Master – Supabase Database Configuration

This repository contains the database schema and configuration for the **Dungeon Master** Discord bot.  

The bot uses [Supabase](https://supabase.com/) (PostgreSQL) to persist player progress, inventory, and in-game mechanics.

## 🤖 The Discord Bot

The **Dungeon Master Bot** is a game bot designed for Discord, enabling players to:
- Create and customize their characters  
- Battle monsters and progress through dungeon floors  
- Acquire loot, equipment, and skills from shops  
- Manage inventories and unique items  
- Gain XP, gold, and levels  

All gameplay actions are persisted in Supabase, ensuring a seamless singleplayer RPG experience inside Discord.

## 📖 Overview

The database stores all the core data that powers the Dungeon Master bot, including:

- **Player accounts** (users table with RPG stats, items, cooldowns, etc.)  
- **Game mechanics** (heroes, monsters, trials, unique items)  
- **Shops** (armors, consumables, skills, weapons)  
- **Inventory system** tied to Discord IDs  
- **Row-Level Security (RLS) policies** to restrict or allow bot interactions  

## 🗄️ Tables

### Core Tables
- **users** → Stores player profiles, linked to Discord accounts.  
- **inventory** → Tracks items owned by each player.  
- **heroes** → List of available heroes with roles, counters, and win/loss rates.  
- **monsters** → Monster stats, rewards, and dungeon floor placement.  
- **trials** → Dungeon/quest progression per Discord user.  

### Shop Tables
- **shop_armors**, **shop_weapons**, **shop_skills**, **shop_consumables** → Items purchasable by players, with stats and prices.  

### Special Items
- **unique_items** → Rare and powerful items with special effects.  

## 🔐 Security Policies

Row-Level Security (RLS) is enabled with policies such as:
- **Allow bot select/update/insert/delete** on relevant tables  
- Ensures only the bot (via its role) can perform actions on the database  

## 📂 Schema Details

This repo includes:
- **Tables** (columns, data types, defaults)  
- **Constraints** (primary keys, foreign keys, checks)  
- **Indexes** for performance  
- **Policies** for bot-controlled access  

## 📑 Table Configurations

### users
| Column                     | Type                     | Default | Notes |
|-----------------------------|--------------------------|---------|-------|
| id                          | uuid                     | null    | PK |
| discord_id                  | text                     | null    | NOT NULL |
| username                    | text                     | null    | NOT NULL |
| level                       | integer                  | 1       |  |
| xp                          | integer                  | 0       |  |
| gold                        | integer                  | 0       |  |
| health                      | integer                  | 100     |  |
| strength                    | integer                  | 10      |  |
| intelligence                | integer                  | 10      |  |
| defense                     | integer                  | 10      |  |
| agility                     | integer                  | 10      |  |
| equipped_armor              | jsonb                    | '{}'    |  |
| equipped_weapons            | jsonb                    | '{}'    |  |
| skills                      | json                     | '[]'    |  |
| skill_cooldowns             | jsonb                    | '{}'    |  |
| cooldowns                   | jsonb                    | '{}'    |  |
| max_floor                   | integer                  | 0       |  |
| instance_id                 | uuid                     | null    |  |
| email, phone, role, etc.    | various (text/json/timestamp) | null | Supabase auth fields |

**Policies:**  
- Bot role can SELECT, INSERT, UPDATE, DELETE.  

---

### inventory
| Column      | Type   | Default                                | Notes |
|-------------|--------|----------------------------------------|-------|
| id          | integer| nextval('inventory_id_seq')            | PK |
| discord_id  | text   | null                                   | FK → users.discord_id |
| item_type   | text   | null                                   | NOT NULL |
| item_name   | text   | null                                   | NOT NULL |
| slot        | text   | null                                   |  |
| stats       | jsonb  | '{}'                                   |  |
| quantity    | int    | 1                                      |  |

**Policies:**  
- Restricted per user; bot manages inventory.  

---

### heroes
| Column         | Type     | Default | Notes |
|----------------|----------|---------|-------|
| hero_id        | integer  | null    | PK |
| name           | text     | null    |  |
| roles          | text     | null    |  |
| lanes          | text     | null    |  |
| counter_to     | text     | null    |  |
| countered_by   | text     | null    |  |
| compatible_with| text     | null    |  |
| pick_rate      | numeric  | null    |  |
| ban_rate       | numeric  | null    |  |
| win_rate       | numeric  | null    |  |

**Policies:**  
- Read-only for bot.  

---

### monsters
| Column      | Type     | Default | Notes |
|-------------|----------|---------|-------|
| id          | integer  | null    | PK |
| name        | text     | null    | NOT NULL |
| floor       | integer  | null    | NOT NULL |
| health      | integer  | null    | NOT NULL |
| strength    | integer  | null    | NOT NULL |
| defense     | integer  | null    | NOT NULL |
| agility     | integer  | null    | NOT NULL |
| intelligence| integer  | null    | NOT NULL |
| rewards     | jsonb    | null    | NOT NULL |

**Policies:**  
- Read-only for bot.  

---

### trials
| Column     | Type     | Default                          | Notes |
|------------|----------|----------------------------------|-------|
| id         | integer  | nextval('trials_id_seq')         | PK |
| discord_id | text     | null                             | NOT NULL |
| floor      | integer  | null                             | NOT NULL |

**Policies:**  
- Bot can update player progress.  

---

### shop_armors
| Column   | Type    | Default                                | Notes |
|----------|---------|----------------------------------------|-------|
| id       | integer | nextval('shop_armors_id_seq')          | PK |
| item_name| text    | null                                   | NOT NULL |
| slot     | text    | null                                   | NOT NULL |
| stats    | jsonb   | '{}'                                   |  |
| price    | integer | null                                   | NOT NULL |

---

### shop_consumables
| Column   | Type    | Default                                | Notes |
|----------|---------|----------------------------------------|-------|
| id       | integer | nextval('shop_consumables_id_seq')     | PK |
| item_name| text    | null                                   | NOT NULL |
| stats    | jsonb   | '{}'                                   |  |
| price    | integer | null                                   | NOT NULL |

---

### shop_skills
| Column       | Type    | Default                             | Notes |
|--------------|---------|-------------------------------------|-------|
| id           | integer | nextval('shop_skills_id_seq')       | PK |
| item_name    | text    | null                                | NOT NULL |
| price        | integer | null                                | NOT NULL |
| effect_scale | integer | 10                                  | NOT NULL |
| cooldown     | integer | null                                |  |

---

### shop_weapons
| Column   | Type    | Default | Notes |
|----------|---------|---------|-------|
| id       | integer | null    | PK |
| item_name| text    | null    | NOT NULL |
| slot     | text    | null    |  |
| stats    | jsonb   | null    |  |
| price    | integer | null    | NOT NULL |

---

### unique_items
| Column       | Type    | Default | Notes |
|--------------|---------|---------|-------|
| id           | integer | null    | PK |
| item_name    | text    | null    | NOT NULL |
| item_type    | text    | null    | NOT NULL |
| slot         | text    | null    |  |
| stats        | jsonb   | null    |  |
| effect_scale | integer | null    |  |
| cooldown     | integer | null    |  |

**Policies:**  
- Read-only for bot.  

---

## 🚀 Getting Started

1. Set up Supabase and apply the schema.  
2. Deploy the Discord bot with your Supabase credentials.  
3. Invite the bot to your server and start playing.  
