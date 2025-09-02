const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonStyle } = require('discord.js');

// Hero ID to name mapping
const heroMap = {
    "129": "Zetian", "128": "Kalea", "127": "Lukas", "126": "Suyou", "125": "Zhuxin",
    "124": "Chip", "123": "Cici", "122": "Nolan", "121": "Ixia", "120": "Arlott",
    "119": "Novaria", "118": "Joy", "117": "Fredrinn", "116": "Julian", "115": "Xavier",
    "114": "Melissa", "113": "Yin", "112": "Floryn", "111": "Edith", "110": "Valentina",
    "109": "Aamon", "108": "Aulus", "107": "Natan", "106": "Phoveus", "105": "Beatrix",
    "104": "Gloo", "103": "Paquito", "102": "Mathilda", "101": "Yve", "100": "Brody",
    "99": "Barats", "98": "Khaleed", "97": "Benedetta", "96": "Luo Yi", "95": "Yu Zhong",
    "94": "Popol and Kupa", "93": "Atlas", "92": "Carmilla", "91": "Cecilion", "90": "Silvanna",
    "89": "Wanwan", "88": "Masha", "87": "Baxia", "86": "Lylia", "85": "Dyrroth",
    "84": "Ling", "83": "X.Borg", "82": "Terizla", "81": "Esmeralda", "80": "Guinevere",
    "79": "Granger", "78": "Khufra", "77": "Badang", "76": "Faramis", "75": "Kadita",
    "74": "Minsitthar", "73": "Harith", "72": "Thamuz", "71": "Kimmy", "70": "Belerick",
    "69": "Hanzo", "68": "Lunox", "67": "Leomord", "66": "Vale", "65": "Claude",
    "64": "Aldous", "63": "Selena", "62": "Kaja", "61": "Chang'e", "60": "Hanabi",
    "59": "Uranus", "58": "Martis", "57": "Valir", "56": "Gusion", "55": "Angela",
    "54": "Jawhead", "53": "Lesley", "52": "Pharsa", "51": "Helcurt", "50": "Zhask",
    "49": "Hylos", "48": "Diggie", "47": "Lancelot", "46": "Odette", "45": "Argus",
    "44": "Grock", "43": "Irithel", "42": "Harley", "41": "Gatotkaca", "40": "Karrie",
    "39": "Roger", "38": "Vexana", "37": "Lapu-Lapu", "36": "Aurora", "35": "Hilda",
    "34": "Estes", "33": "Cyclops", "32": "Johnson", "31": "Moskov", "30": "Yi Sun-shin",
    "29": "Ruby", "28": "Alpha", "27": "Sun", "26": "Chou", "25": "Kagura",
    "24": "Natalia", "23": "Gord", "22": "Freya", "21": "Hayabusa", "20": "Lolita",
    "19": "Minotaur", "18": "Layla", "17": "Fanny", "16": "Zilong", "15": "Eudora",
    "14": "Rafaela", "13": "Clint", "12": "Bruno", "11": "Bane", "10": "Franco",
    "9": "Akai", "8": "Karina", "7": "Alucard", "6": "Tigreal", "5": "Nana",
    "4": "Alice", "3": "Saber", "2": "Balmond", "1": "Miya"
};

// Simple in-memory cache
const cache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

function getCachedData(key) {
  const cached = cache.get(key);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }
  cache.delete(key);
  return null;
}

function setCachedData(key, data) {
  cache.set(key, { data, timestamp: Date.now() });
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('hero-rank')
    .setDescription('Show trending heroes in Mobile Legends based on ban rate'),
  async execute(interaction) {
    await interaction.deferReply();

    // Initial state: Fetching data
    const thinkingEmbed = new EmbedBuilder()
      .setColor('#FFD700')
      .setTitle('⏳ Fetching Data...')
      .setDescription('Thinking...')
      .setFooter({ text: 'Dungeon Adventure' });
    await interaction.editReply({ embeds: [thinkingEmbed] });

    // Default parameters
    let days = '7';
    let rank = 'glory';
    let sortField = 'ban_rate';
    let sortOrder = 'desc';

    const cacheKey = `${days}-${rank}-${sortField}-${sortOrder}`;
    let data = getCachedData(cacheKey);

    if (!data) {
      try {
        const apiUrl = `https://mlbb-stats.ridwaanhall.com/api/hero-rank/?days=${days}&rank=${rank}&size=10&index=1&sort_field=${sortField}&sort_order=${sortOrder}`;
        const response = await fetch(apiUrl);
        if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
        data = await response.json();

        if (data.code !== 0 || !data.data || !data.data.records) {
          throw new Error(data.message || 'Failed to fetch hero data');
        }
        setCachedData(cacheKey, data);
      } catch (error) {
        console.error('Error fetching hero ranks:', error);
        const errorEmbed = new EmbedBuilder()
          .setColor('#FF0000')
          .setTitle('❌ Error')
          .setDescription('Failed to fetch trending heroes. Please try again later.')
          .setFooter({ text: 'Dungeon Adventure' });
        await interaction.editReply({ embeds: [errorEmbed] });
        return;
      }
    }

    // Map heroes
    const heroes = data.data.records.map(record => {
      const mainHero = heroMap[record.data.main_heroid.toString()] || `Unknown Hero (ID: ${record.data.main_heroid})`;
      const pickRate = (record.data.main_hero_appearance_rate * 100).toFixed(2) + '%';
      const banRate = (record.data.main_hero_ban_rate * 100).toFixed(2) + '%';
      const winRate = (record.data.main_hero_win_rate * 100).toFixed(2) + '%';
      const counterHeroes = record.data.sub_hero
        .map(sub => `${heroMap[sub.heroid.toString()] || `Unknown Hero (ID: ${sub.heroid})`} (+${(sub.increase_win_rate * 100).toFixed(2)}%)`)
        .join(', ') || 'None';
      return { mainHero, pickRate, banRate, winRate, counterHeroes };
    });

    // Show default result
    const resultEmbed = new EmbedBuilder()
      .setColor('#FFD700')
      .setTitle(`🏆 Trending Heroes (${rank.charAt(0).toUpperCase() + rank.slice(1)}, Last ${days} Days)`)
      .setDescription(`Sorted by ${sortField.replace('_', ' ').replace('rate', ' Rate')}:`)
      .addFields(
        heroes.map((hero, index) => ({
          name: `${index + 1}. ${hero.mainHero}`,
          value: `Pick Rate: ${hero.pickRate}\nBan Rate: ${hero.banRate}\nWin Rate: ${hero.winRate}\nCounter Heroes: ${hero.counterHeroes}`
        }))
      )
      .setFooter({ text: 'Dungeon Adventure' });

    // Dropdown options
    const daysOptions = [
      { label: '1 Day', value: '1' },
      { label: '3 Days', value: '3' },
      { label: '7 Days', value: '7' },
      { label: '15 Days', value: '15' },
      { label: '30 Days', value: '30' }
    ];

    const rankOptions = [
      { label: 'All', value: 'all' },
      { label: 'Epic', value: 'epic' },
      { label: 'Legend', value: 'legend' },
      { label: 'Mythic', value: 'mythic' },
      { label: 'Honor', value: 'honor' },
      { label: 'Glory', value: 'glory' }
    ];

    const sortFieldOptions = [
      { label: 'Pick Rate', value: 'pick_rate' },
      { label: 'Ban Rate', value: 'ban_rate' },
      { label: 'Win Rate', value: 'win_rate' }
    ];

    // Create dropdowns
    const daysMenu = new StringSelectMenuBuilder()
      .setCustomId('change_days')
      .setPlaceholder(`Days: ${days}`)
      .addOptions(daysOptions);

    const rankMenu = new StringSelectMenuBuilder()
      .setCustomId('change_rank')
      .setPlaceholder(`Rank: ${rank.charAt(0).toUpperCase() + rank.slice(1)}`)
      .addOptions(rankOptions);

    const sortFieldMenu = new StringSelectMenuBuilder()
      .setCustomId('change_sort_field')
      .setPlaceholder(`Sort: ${sortField.replace('_', ' ').replace('rate', ' Rate')}`)
      .addOptions(sortFieldOptions);

    const row1 = new ActionRowBuilder().addComponents(daysMenu);
    const row2 = new ActionRowBuilder().addComponents(rankMenu);
    const row3 = new ActionRowBuilder().addComponents(sortFieldMenu);

    await interaction.editReply({ embeds: [resultEmbed], components: [row1, row2, row3] });

    // Collector for dropdown interactions
    const filter = i => (i.customId === 'change_days' || i.customId === 'change_rank' || i.customId === 'change_sort_field') && i.user.id === interaction.user.id;
    const collector = interaction.channel.createMessageComponentCollector({ filter, time: 60000 });

    collector.on('collect', async i => {
      await i.deferUpdate();
      collector.resetTimer({ time: 60000 }); // Reset timer on interaction

      await interaction.editReply({
        embeds: [new EmbedBuilder()
          .setColor('#FFD700')
          .setTitle('⏳ Thinking...')
          .setDescription('Fetching updated data...')
          .setFooter({ text: 'Dungeon Adventure' })
        ]
      });

      if (i.customId === 'change_days') days = i.values[0];
      if (i.customId === 'change_rank') rank = i.values[0];
      if (i.customId === 'change_sort_field') {
        sortField = i.values[0];
        sortOrder = sortField === 'win_rate' ? 'desc' : 'desc'; // Adjusted for consistency
      }

      const newCacheKey = `${days}-${rank}-${sortField}-${sortOrder}`;
      data = getCachedData(newCacheKey);

      if (!data) {
        try {
          const apiUrl = `https://mlbb-stats.ridwaanhall.com/api/hero-rank/?days=${days}&rank=${rank}&size=10&index=1&sort_field=${sortField}&sort_order=${sortOrder}`;
          const response = await fetch(apiUrl);
          if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
          data = await response.json();

          if (data.code !== 0 || !data.data || !data.data.records) {
            throw new Error(data.message || 'Failed to fetch hero data');
          }
          setCachedData(newCacheKey, data);
        } catch (error) {
          console.error('Error fetching hero ranks:', error);
          await interaction.editReply({
            embeds: [new EmbedBuilder()
              .setColor('#FF0000')
              .setTitle('❌ Error')
              .setDescription('Failed to fetch updated heroes. Reverting to default.')
              .setFooter({ text: 'Dungeon Adventure' })
            ],
            components: []
          });
          return;
        }
      }

      // Map heroes again
      const updatedHeroes = data.data.records.map(record => {
        const mainHero = heroMap[record.data.main_heroid.toString()] || `Unknown Hero (ID: ${record.data.main_heroid})`;
        const pickRate = (record.data.main_hero_appearance_rate * 100).toFixed(2) + '%';
        const banRate = (record.data.main_hero_ban_rate * 100).toFixed(2) + '%';
        const winRate = (record.data.main_hero_win_rate * 100).toFixed(2) + '%';
        const counterHeroes = record.data.sub_hero
          .map(sub => `${heroMap[sub.heroid.toString()] || `Unknown Hero (ID: ${sub.heroid})`} (+${(sub.increase_win_rate * 100).toFixed(2)}%)`)
          .join(', ') || 'None';
        return { mainHero, pickRate, banRate, winRate, counterHeroes };
      });

      const updatedEmbed = new EmbedBuilder()
        .setColor('#FFD700')
        .setTitle(`🏆 Trending Heroes (${rank.charAt(0).toUpperCase() + rank.slice(1)}, Last ${days} Days)`)
        .setDescription(`Sorted by ${sortField.replace('_', ' ').replace('rate', ' rate')}:`)
        .addFields(
          updatedHeroes.map((hero, index) => ({
            name: `${index + 1}. ${hero.mainHero}`,
            value: `Pick Rate: ${hero.pickRate}\nBan Rate: ${hero.banRate}\nWin Rate: ${hero.winRate}\nCounter Heroes: ${hero.counterHeroes}`
          }))
        )
        .setFooter({ text: 'Dungeon Adventure' });

      // Update dropdown placeholders
      daysMenu.setPlaceholder(`Days: ${days}`);
      rankMenu.setPlaceholder(`Rank: ${rank.charAt(0).toUpperCase() + rank.slice(1)}`);
      sortFieldMenu.setPlaceholder(`Sort: ${sortField.replace('_', ' ').replace('rate', ' rate')}`);

      await interaction.editReply({ embeds: [updatedEmbed], components: [row1, row2, row3] });
    });

    collector.on('end', async (collected, reason) => {
      if (reason === 'time') {
        await interaction.editReply({
          embeds: [resultEmbed], 
          components: []
        });
      }
    });
  }
};