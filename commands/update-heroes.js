const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('update-heroes')
    .setDescription('Update hero statistics and roles from the API'),
  async execute(interaction, supabase) {
    await interaction.deferReply();

    const thinkingEmbed = new EmbedBuilder()
      .setColor('#FFD700')
      .setTitle('⏳ Updating Heroes...')
      .setDescription('Fetching and processing data. This may take a while...')
      .setFooter({ text: 'Dungeon Adventure' });
    await interaction.editReply({ embeds: [thinkingEmbed] });

    try {
      // First API: hero-rank
      const heroRankUrl = 'https://mlbb-stats.ridwaanhall.com/api/hero-rank/?days=7&rank=glory&size=129&index=1&sort_field=ban_rate&sort_order=asc';
      const rankResponse = await fetch(heroRankUrl);
      if (!rankResponse.ok) throw new Error(`HTTP error! Status: ${rankResponse.status}`);
      const rankData = await rankResponse.json();

      if (rankData.code !== 0 || !rankData.data || !rankData.data.records) {
        throw new Error(rankData.message || 'Failed to fetch hero rank data');
      }

      // Second API: hero-position
      const heroPositionUrl = 'https://mlbb-stats.ridwaanhall.com/api/hero-position/?role=all&lane=all&size=129&index=1';
      const positionResponse = await fetch(heroPositionUrl);
      if (!positionResponse.ok) throw new Error(`HTTP error! Status: ${positionResponse.status}`);
      const positionData = await positionResponse.json();

      if (positionData.code !== 0 || !positionData.data || !positionData.data.records) {
        throw new Error(positionData.message || 'Failed to fetch hero position data');
      }

      // Process hero-rank data
      const rankMap = new Map();
      rankData.data.records.forEach(record => {
        const heroId = record.data.main_heroid;
        rankMap.set(heroId, {
          pick_rate: record.data.main_hero_appearance_rate,
          ban_rate: record.data.main_hero_ban_rate,
          win_rate: record.data.main_hero_win_rate
        });
      });

      // Process hero-position data with constraints and error handling
      const positionMap = new Map();
positionData.data.records.forEach(record => {
  const heroId = record.data.hero_id;
  const sortid = record.data.hero?.data?.sortid || [];
  const roadsort = record.data.hero?.data?.roadsort || [];

  const rolesRaw = Array.isArray(sortid)
    ? sortid
        .map(s => s?.data?.sort_title || null)
        .filter(Boolean)
    : [];

  const lanesRaw = Array.isArray(roadsort)
    ? roadsort
        .map(r => r?.data?.road_sort_title || null)
        .filter(Boolean)
    : [];

  const counterToRaw = record.data.relation?.strong?.target_hero_id || [];
  const counteredByRaw = record.data.relation?.weak?.target_hero_id || [];
  const compatibleWithRaw = record.data.relation?.assist?.target_hero_id || [];

  const roleMap = {
    mage: 'mage',
    tank: 'tank',
    fighter: 'fighter',
    ass: 'assassin',
    mm: 'marksman',
    supp: 'support'
  };
  const roles = rolesRaw
    .map(r => roleMap[r.toLowerCase()] || r.toLowerCase())
    .filter(r => Object.values(roleMap).includes(r))
    .join(', ') || null;

  const laneMap = {
    'Exp Lane': 'exp',
    'Mid Lane': 'mid',
    'Roam': 'roam',
    'Jungle': 'jungle',
    'Gold Lane': 'gold'
  };
  const lanes = lanesRaw
    .map(l => laneMap[l] || l)
    .filter(l => Object.values(laneMap).includes(l))
    .join(', ') || null;

  const counterTo = counterToRaw.filter(id => id > 0).slice(0, 2);
  const counteredBy = counteredByRaw.filter(id => id > 0).slice(0, 2);
  const compatibleWith = compatibleWithRaw.filter(id => id > 0).slice(0, 2);

  positionMap.set(heroId, {
    roles,
    lanes,
    counter_to: counterTo.length ? `{${counterTo.join(', ')}}` : null,
    countered_by: counteredBy.length ? `{${counteredBy.join(', ')}}` : null,
    compatible_with: compatibleWith.length ? `{${compatibleWith.join(', ')}}` : null
  });
});
      // Update database using Supabase
      for (let heroId = 1; heroId <= 129; heroId++) {
        const rankData = rankMap.get(heroId) || { pick_rate: null, ban_rate: null, win_rate: null };
        const positionData = positionMap.get(heroId) || { roles: null, lanes: null, counter_to: null, countered_by: null, compatible_with: null };
        const { error, data: updateData } = await supabase
          .from('heroes')
          .update({
            roles: positionData.roles,
            lanes: positionData.lanes,
            pick_rate: rankData.pick_rate,
            ban_rate: rankData.ban_rate,
            win_rate: rankData.win_rate,
            counter_to: positionData.counter_to,
            countered_by: positionData.countered_by,
            compatible_with: positionData.compatible_with
          })
          .eq('hero_id', heroId)
          .select();

        if (error) throw error;
      }

      const successEmbed = new EmbedBuilder()
        .setColor('#00FF00')
        .setTitle('✅ Heroes Updated')
        .setDescription('Successfully updated hero statistics.')
        .setFooter({ text: 'Dungeon Adventure' });
      await interaction.editReply({ embeds: [successEmbed] });

    } catch (error) {
      console.error('Error updating heroes:', error);
      const errorEmbed = new EmbedBuilder()
        .setColor('#FF0000')
        .setTitle('❌ Update Failed')
        .setDescription(`Failed to update heroes: ${error.message}`)
        .setFooter({ text: 'Dungeon Adventure' });
      await interaction.editReply({ embeds: [errorEmbed] });
    }
  }
};