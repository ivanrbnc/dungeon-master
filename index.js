// index.js - Fixed command execution
require('dotenv').config();
const { Client, GatewayIntentBits, SlashCommandBuilder, REST, Routes, MessageFlags } = require('discord.js');
const { createClient } = require('@supabase/supabase-js');

// Initialize Discord client
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

// Initialize Supabase client
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

// Define slash commands
const commands = [
  new SlashCommandBuilder()
    .setName('register')
    .setDescription('Register yourself as a new player in the dungeon'),
  new SlashCommandBuilder()
    .setName('inventory')
    .setDescription('Manage your inventory by equipping or using items.'),
  new SlashCommandBuilder()
    .setName('shop')
    .setDescription('Browse and purchase items from the shop'),
  new SlashCommandBuilder()
    .setName('profile')
    .setDescription('View your character profile.'),
  new SlashCommandBuilder()
    .setName('dungeon')
    .setDescription('Enter the dungeon for battles'),
  new SlashCommandBuilder()
    .setName('trial')
    .setDescription('Participate in trials'),
].map(command => command.toJSON());

// Register commands when the bot is ready
client.once('ready', async () => {  
  console.log(`Logged in as ${client.user.tag}`);
  
  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
  try {
    const { data: tables } = await supabase.rpc('get_all_tables');

    for (const t of tables) {
      const tableName = t.table_name;
      const { data: columns } = await supabase.rpc('get_table_columns', { tbl: tableName });
      console.log(`Table: ${tableName}`, columns);
      const { data: rows } = await supabase.from(tableName).select('*');
      console.log(`Rows from ${tableName}:`, rows);
    }

    if (process.env.GUILD_ID) {
      await rest.put(Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID), {
        body: commands,
      });
      console.log('Registered commands for guild');
    } else {
      await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), {
        body: commands,
      });
      console.log('Registered commands globally');
    }
  } catch (error) {
    console.error('Error registering commands:', error);
  }
});

// Handle slash commands
client.on('interactionCreate', async interaction => {
  if (!interaction.isCommand()) return;

  const { commandName, user } = interaction;

  try {
    // Route to command handler
    if (commandName === 'register') {
      const command = require('./commands/register');
      await command.execute(interaction, supabase);
    } else if (commandName === 'inventory') {
      const command = require('./commands/inventory');
      await command.execute(interaction, supabase);
    } else if (commandName === 'shop') {
      const command = require('./commands/shop');
      await command.execute(interaction, supabase);
    } else if (commandName === 'profile') {
      const command = require('./commands/profile');
      await command.execute(interaction, supabase);
    } else if (commandName === 'dungeon') {
      await interaction.reply({ content: '🛠️ The dungeon is under construction. Check back soon for battles!', flags: [MessageFlags.Ephemeral] });
    } else if (commandName === 'trial') {
      await interaction.reply({ content: '🛠️ Trials are under construction. Prepare for epic challenges soon!', flags: [MessageFlags.Ephemeral] });
    }
  } catch (error) {
    console.error('Error in interactionCreate:', error);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({ content: 'An error occurred. Please try again.', flags: [MessageFlags.Ephemeral] });
    } else {
      await interaction.editReply({ content: 'An error occurred. Please try again.' });
    }
  }
});

// Log in to Discord
client.login(process.env.DISCORD_TOKEN);