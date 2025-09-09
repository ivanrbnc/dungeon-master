const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('draft-pick')
    .setDescription('Start a MLBB draft pick process')
    .addStringOption(option =>
      option.setName('pick-order')
        .setDescription('Choose your pick order: first or second')
        .setRequired(true)
        .addChoices(
          { name: 'First Pick', value: 'first' },
          { name: 'Second Pick', value: 'second' }
        )
    ),
  async execute(interaction, supabase) {
    await interaction.deferReply();

    const pickOrder = interaction.options.getString('pick-order');
    const thinkingEmbed = new EmbedBuilder()
      .setColor('#FFD700')
      .setTitle('⏳ Starting Draft Pick...')
      .setDescription('Initializing the draft process. Please wait...')
      .setFooter({ text: 'Dungeon Adventure' });
    await interaction.editReply({ embeds: [thinkingEmbed] });

    // Fetch all heroes
    const { data: heroes, error: fetchError } = await supabase.from('heroes').select('*');
    if (fetchError || !heroes || heroes.length === 0) {
      console.error('Supabase fetch error:', fetchError);
      throw new Error('Failed to fetch heroes data');
    }

    // Validate and clean heroes data
    const validHeroes = heroes.filter(h => h.hero_id && typeof h.hero_id === 'number' && h.hero_id > 0 && h.name && h.roles && h.lanes);
    if (validHeroes.length === 0) throw new Error('No valid heroes found in the database');
    console.log('Valid heroes count:', validHeroes.length);

    // Convert counter_to, countered_by, compatible_with from string to arrays
    const heroMap = {};
    validHeroes.forEach(hero => {
      heroMap[hero.hero_id] = hero;
      hero.counter_to = hero.counter_to ? hero.counter_to.slice(1, -1).split(', ').map(id => parseInt(id) || null).filter(id => id) : [];
      hero.countered_by = hero.countered_by ? hero.countered_by.slice(1, -1).split(', ').map(id => parseInt(id) || null).filter(id => id) : [];
      hero.compatible_with = hero.compatible_with ? hero.compatible_with.slice(1, -1).split(', ').map(id => parseInt(id) || null).filter(id => id) : [];
    });

    // Step 1: Ban Phase
    let bannedHeroes = [];
    let availableHeroes = validHeroes; // Use validated heroes
    const topBans = validHeroes
      .sort((a, b) => b.ban_rate - a.ban_rate)
      .slice(0, 10)
      .map(hero => `${hero.name} (Ban Rate: ${(hero.ban_rate * 100).toFixed(2)}%)`);
    const updateBanPhase = async (roleFilter = '', laneFilter = '') => {
      const filteredHeroes = availableHeroes.filter(h =>
        h.hero_id && typeof h.hero_id === 'number' && h.hero_id > 0 && h.name && h.roles && h.lanes && // Stricter validation
        (!roleFilter || h.roles.toLowerCase().includes(roleFilter.toLowerCase())) &&
        (!laneFilter || h.lanes.toLowerCase().includes(laneFilter.toLowerCase()))
      );
      console.log('Filtered heroes count:', filteredHeroes.length, 'with filters:', { roleFilter, laneFilter });
      if (filteredHeroes.length === 0) {
        await interaction.editReply({ content: 'No heroes match the current filters. Please adjust filters or use "None".', embeds: [], components: [] });
        return;
      }
      const banOptions = filteredHeroes.slice(0, 25).map(hero => ({
        label: hero.name || `Hero ID ${hero.hero_id}`,
        description: `Roles: ${hero.roles || 'Unknown'}, Lanes: ${hero.lanes || 'Unknown'}`,
        value: hero.hero_id.toString()
      })).filter(option => option.value && option.value.length > 0); // Ensure valid value
      if (banOptions.length === 0) {
        await interaction.editReply({ content: 'No valid hero options available. Please adjust filters.', embeds: [], components: [] });
        return;
      }

      const roleMenu = new StringSelectMenuBuilder()
        .setCustomId('filter_role_ban')
        .setPlaceholder('Filter by Role')
        .addOptions(
          { label: 'None', value: '' },
          { label: 'Tank', value: 'tank' },
          { label: 'Fighter', value: 'fighter' },
          { label: 'Assassin', value: 'ass' },
          { label: 'Mage', value: 'mage' },
          { label: 'Marksman', value: 'mm' },
          { label: 'Support', value: 'supp' }
        );
      const laneMenu = new StringSelectMenuBuilder()
        .setCustomId('filter_lane_ban')
        .setPlaceholder('Filter by Lane')
        .addOptions(
          { label: 'None', value: '' },
          { label: 'Exp', value: 'exp' },
          { label: 'Mid', value: 'mid' },
          { label: 'Roam', value: 'roam' },
          { label: 'Jungle', value: 'jungle' },
          { label: 'Gold', value: 'gold' }
        );
      const banMenu = new StringSelectMenuBuilder()
        .setCustomId('ban_heroes')
        .setPlaceholder('Select heroes to ban')
        .setMinValues(1)
        .setMaxValues(10 - bannedHeroes.length)
        .addOptions(banOptions);

      const filterRow = new ActionRowBuilder().addComponents(roleMenu, laneMenu);
      const banRow = new ActionRowBuilder().addComponents(banMenu);
      const goButton = new ButtonBuilder()
        .setCustomId('go_to_draft')
        .setLabel('Go to Draft Pick')
        .setStyle(ButtonStyle.Primary)
        .setDisabled(bannedHeroes.length < 5);

      const banEmbed = new EmbedBuilder()
        .setColor('#FF4500')
        .setTitle('🔨 Ban Phase')
        .setDescription('Use the top 10 ban rate heroes below as guidance.\n' + topBans.join('\n'))
        .addFields(
          { name: 'Banned Heroes', value: bannedHeroes.length ? bannedHeroes.map(id => heroMap[id].name).join(', ') : 'None' }
        );
      await interaction.editReply({ embeds: [banEmbed], components: [filterRow, banRow, new ActionRowBuilder().addComponents(goButton)] });
    };

    await updateBanPhase();
    const banCollector = interaction.channel.createMessageComponentCollector({ filter: i => (i.customId === 'ban_heroes' || i.customId === 'filter_role_ban' || i.customId === 'filter_lane_ban' || i.customId === 'go_to_draft') && i.user.id === interaction.user.id, time: 60000 });

    banCollector.on('collect', async i => {
      if (i.customId === 'ban_heroes') {
        const newBans = i.values.map(v => parseInt(v)).filter(id => !bannedHeroes.includes(id));
        bannedHeroes = [...bannedHeroes, ...newBans];
        await i.update({ content: `Banned: ${newBans.map(id => heroMap[id].name).join(', ')}`, embeds: [], components: [] });
        await updateBanPhase();
      } else if (i.customId === 'filter_role_ban') {
        await updateBanPhase(i.values[0], '');
      } else if (i.customId === 'filter_lane_ban') {
        await updateBanPhase('', i.values[0]);
      } else if (i.customId === 'go_to_draft' && bannedHeroes.length >= 5) {
        availableHeroes = validHeroes.filter(h => !bannedHeroes.includes(h.hero_id));
        banCollector.stop();
      }
    });

    banCollector.on('end', async collected => {
      if (bannedHeroes.length < 5) {
        await interaction.editReply({ content: 'Ban phase requires at least 5 heroes. Please restart with /draft-pick.', embeds: [], components: [] });
        return;
      }
      // Step 2: Draft Pick Process
      const ourTeam = [];
      const enemyTeam = [];
      const pickSequence = pickOrder === 'first'
        ? [1, 2, 2, 2, 2, 1] // First pick: us, them, us, them, us, them
        : [2, 1, 2, 2, 2, 1]; // Second pick: them, us, them, us, them, us
      let currentTurn = 0;
      let remainingPicks = 0;

      const processTurn = async (roleFilter = '', laneFilter = '') => {
        const isOurTurn = (pickOrder === 'first' && currentTurn % 2 === 0) || (pickOrder === 'second' && currentTurn % 2 === 1);
        const picks = pickSequence[currentTurn];
        const team = isOurTurn ? ourTeam : enemyTeam;
        remainingPicks = picks;

        const filteredHeroes = availableHeroes.filter(h =>
          h.hero_id && typeof h.hero_id === 'number' && h.hero_id > 0 && h.name && h.roles && h.lanes && // Stricter validation
          (!roleFilter || h.roles.toLowerCase().includes(roleFilter.toLowerCase())) &&
          (!laneFilter || h.lanes.toLowerCase().includes(laneFilter.toLowerCase()))
        );
        if (filteredHeroes.length === 0) {
          await interaction.editReply({ content: 'No heroes match the current filters. Please adjust filters or use "None".', embeds: [], components: [] });
          return;
        }
        const pickOptions = filteredHeroes.slice(0, 25).map(hero => ({
          label: hero.name || `Hero ID ${hero.hero_id}`,
          description: `Roles: ${hero.roles || 'Unknown'}, Lanes: ${hero.lanes || 'Unknown'}`,
          value: hero.hero_id.toString()
        })).filter(option => option.value && option.value.length > 0); // Ensure valid value
        if (pickOptions.length === 0) {
          await interaction.editReply({ content: 'No valid hero options available. Please adjust filters.', embeds: [], components: [] });
          return;
        }

        const roleMenu = new StringSelectMenuBuilder()
          .setCustomId('filter_role_pick')
          .setPlaceholder('Filter by Role')
          .addOptions(
            { label: 'None', value: '' },
            { label: 'Tank', value: 'tank' },
            { label: 'Fighter', value: 'fighter' },
            { label: 'Assassin', value: 'ass' },
            { label: 'Mage', value: 'mage' },
            { label: 'Marksman', value: 'mm' },
            { label: 'Support', value: 'supp' }
          );
        const laneMenu = new StringSelectMenuBuilder()
          .setCustomId('filter_lane_pick')
          .setPlaceholder('Filter by Lane')
          .addOptions(
            { label: 'None', value: '' },
            { label: 'Exp', value: 'exp' },
            { label: 'Mid', value: 'mid' },
            { label: 'Roam', value: 'roam' },
            { label: 'Jungle', value: 'jungle' },
            { label: 'Gold', value: 'gold' }
          );
        const pickMenu = new StringSelectMenuBuilder()
          .setCustomId(`pick_heroes_${currentTurn}`)
          .setPlaceholder(`Select ${remainingPicks} hero(s) for ${isOurTurn ? 'your team' : 'enemy team'}`)
          .setMinValues(1)
          .setMaxValues(remainingPicks)
          .addOptions(pickOptions);

        let synergyText = '';
        if (isOurTurn) {
          const currentSynergies = ourTeam.flatMap(h => heroMap[h].compatible_with)
            .filter(id => availableHeroes.some(h => h.hero_id === id))
            .map(id => heroMap[id]?.name || `Unknown (ID: ${id})`);
          synergyText = currentSynergies.length ? `Synergies: ${currentSynergies.join(', ')}` : 'No strong synergies available.';
        } else {
          const enemySynergies = enemyTeam.flatMap(h => heroMap[h].compatible_with)
            .filter(id => availableHeroes.some(h => h.hero_id === id))
            .map(id => heroMap[id]?.name || `Unknown (ID: ${id})`);
          synergyText = enemySynergies.length ? `Counters: ${enemySynergies.join(', ')}` : 'No strong counters available.';
        }

        const pickEmbed = new EmbedBuilder()
          .setColor(isOurTurn ? '#00FF00' : '#FF0000')
          .setTitle(`${isOurTurn ? '✅ Your Turn' : '❌ Enemy Turn'} to Pick`)
          .setDescription(synergyText)
          .addFields(
            { name: 'Banned Heroes', value: bannedHeroes.map(id => heroMap[id].name).join(', ') || 'None' },
            { name: 'Our Team', value: ourTeam.map(id => heroMap[id].name).join(', ') || 'None' },
            { name: 'Enemy Team', value: enemyTeam.map(id => heroMap[id].name).join(', ') || 'None' }
          );
        await interaction.editReply({ embeds: [pickEmbed], components: [new ActionRowBuilder().addComponents(roleMenu), new ActionRowBuilder().addComponents(laneMenu), new ActionRowBuilder().addComponents(pickMenu)] });

        const pickCollector = interaction.channel.createMessageComponentCollector({ filter: i => (i.customId === `pick_heroes_${currentTurn}` || i.customId === 'filter_role_pick' || i.customId === 'filter_lane_pick') && i.user.id === interaction.user.id, time: 60000 });
        pickCollector.on('collect', async i => {
          if (i.customId === `pick_heroes_${currentTurn}`) {
            const newPicks = i.values.map(v => parseInt(v)).filter(id => ![...ourTeam, ...enemyTeam].includes(id));
            newPicks.forEach(id => team.push(id));
            availableHeroes = availableHeroes.filter(h => !newPicks.includes(h.hero_id));
            remainingPicks -= newPicks.length;
            await i.update({ content: `${isOurTurn ? 'Your' : 'Enemy'} team picked: ${newPicks.map(id => heroMap[id].name).join(', ')}`, embeds: [], components: [] });
            if (remainingPicks > 0) {
              await processTurn(roleFilter, laneFilter);
            } else {
              currentTurn++;
              if (currentTurn < pickSequence.length) {
                await processTurn();
              } else {
                const resultEmbed = new EmbedBuilder()
                  .setColor('#00CED1')
                  .setTitle('🏆 Draft Pick Complete')
                  .addFields(
                    { name: 'Our Team', value: ourTeam.map(id => heroMap[id].name).join(', ') },
                    { name: 'Enemy Team', value: enemyTeam.map(id => heroMap[id].name).join(', ') }
                  );
                await interaction.editReply({ embeds: [resultEmbed], components: [] });
              }
            }
          } else if (i.customId === 'filter_role_pick') {
            await processTurn(i.values[0], laneFilter);
          } else if (i.customId === 'filter_lane_pick') {
            await processTurn(roleFilter, i.values[0]);
          }
        });
        pickCollector.on('end', async collected => {
          if (!collected.size) {
            await interaction.editReply({ content: 'Pick timed out. Please restart with /draft-pick.', embeds: [], components: [] });
          }
        });
      };

      await processTurn();
    });
  }
};