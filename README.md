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

All gameplay actions are persisted in Supabase, ensuring a seamless multiplayer RPG experience inside Discord.

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
| Column        | Type      | Constraints |
|---------------|----------|-------------|
| id            | uuid     | PK, default gen_random_uuid() |
| discord_id    | text     | UNIQUE |
| username      | text     | NOT NULL |
| level         | int      | DEFAULT 1 |
| xp            | int      | DEFAULT 0 |
| gold          | int      | DEFAULT 0 |

**Policies:**  
- Bot role can SELECT, INSERT, UPDATE, DELETE.  

### inventory
| Column      | Type  | Constraints |
|-------------|-------|-------------|
| id          | uuid  | PK |
| user_id     | uuid  | FK → users.id |
| item_id     | uuid  | FK → shop tables / unique_items |
| quantity    | int   | DEFAULT 1 |

**Policies:**  
- Restricted per user; bot manages inventory.  

### heroes
| Column       | Type  | Constraints |
|--------------|-------|-------------|
| hero_id      | int   | PK |
| name         | text  | UNIQUE |
| roles        | text  |  |
| lanes        | text  |  |
| pick_rate    | json  |  |
| ban_rate     | json  |  |
| win_rate     | json  |  |
| counter_to   | text  |  |
| countered_by | text  |  |
| compatible_with | text | |

**Policies:**  
- Read-only for bot (no player modification).  

### monsters
| Column     | Type  | Constraints |
|------------|-------|-------------|
| id         | uuid  | PK |
| name       | text  | UNIQUE |
| hp         | int   | NOT NULL |
| attack     | int   | NOT NULL |
| defense    | int   | NOT NULL |
| reward_xp  | int   | NOT NULL |
| reward_gold| int   | NOT NULL |
| floor      | int   | NOT NULL |

**Policies:**  
- Read-only for bot.  

### trials
| Column      | Type  | Constraints |
|-------------|-------|-------------|
| id          | uuid  | PK |
| user_id     | uuid  | FK → users.id |
| floor       | int   | NOT NULL |
| progress    | text  | DEFAULT 'in_progress' |

**Policies:**  
- Bot can update player progress.  

### shop_armors, shop_weapons, shop_skills, shop_consumables
| Column      | Type  | Constraints |
|-------------|-------|-------------|
| id          | uuid  | PK |
| name        | text  | UNIQUE |
| price       | int   | NOT NULL |
| stats       | json  |  |

**Policies:**  
- Read-only for bot.  

### unique_items
| Column      | Type  | Constraints |
|-------------|-------|-------------|
| id          | uuid  | PK |
| name        | text  | UNIQUE |
| effect      | text  | NOT NULL |
| rarity      | text  | NOT NULL |

**Policies:**  
- Read-only for bot.  

## 🚀 Getting Started

1. Set up Supabase and apply the schema.  
2. Deploy the Discord bot with your Supabase credentials.  
3. Invite the bot to your server and start playing.  