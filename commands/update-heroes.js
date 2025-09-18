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
      const heroRankUrl = 'https://mlbb-stats.ridwaanhall.com/api/hero-rank/?days=7&rank=glory&size=130&index=1&sort_field=ban_rate&sort_order=asc';
      const rankResponse = await fetch(heroRankUrl);
      if (!rankResponse.ok) throw new Error(`HTTP error! Status: ${rankResponse.status}`);
      const rankData = await rankResponse.json();
      if (rankData.code !== 0 || !rankData.data || !rankData.data.records) {
        throw new Error(rankData.message || 'Failed to fetch hero rank data');
      }

      const heroPositionUrl = 'https://mlbb-stats.ridwaanhall.com/api/hero-position/?role=all&lane=all&size=130&index=1';
      const positionResponse = await fetch(heroPositionUrl);
      if (!positionResponse.ok) throw new Error(`HTTP error! Status: ${positionResponse.status}`);
      const positionData = await positionResponse.json();
      if (positionData.code !== 0 || !positionData.data || !positionData.data.records) {
        throw new Error(positionData.message || 'Failed to fetch hero position data');
      }

      console.log('Position Data Records:', JSON.stringify(positionData.data.records, null, 2));

      const rankMap = new Map();
      rankData.data.records.forEach(record => {
        const heroId = record.data.main_heroid;
        rankMap.set(heroId, {
          pick_rate: record.data.main_hero_appearance_rate,
          ban_rate: record.data.main_hero_ban_rate,
          win_rate: record.data.main_hero_win_rate
        });
      });

      const positionMap = new Map();
      positionData.data.records.forEach(record => {
        const heroId = record.data.hero_id;
        const sortid = record.data.hero?.data?.sortid || [];
        const roadsort = record.data.hero?.data?.roadsort || [];

        const rolesRaw = Array.isArray(sortid)
          ? sortid.map(s => s?.data?.sort_title || null).filter(Boolean)
          : [];
        const lanesRaw = Array.isArray(roadsort)
          ? roadsort.map(r => r?.data?.road_sort_title || null).filter(Boolean)
          : [];
        const counterToRaw = record.data.relation?.strong?.target_hero_id || [];
        const counteredByRaw = record.data.relation?.weak?.target_hero_id || [];
        const compatibleWithRaw = record.data.relation?.assist?.target_hero_id || [];

        const roleMap = {
          mage: 'mage',
          tank: 'tank',
          fighter: 'fighter',
          ass: 'assassin',
          assassin: 'assassin',
          mm: 'marksman',
          marksman: 'marksman',
          supp: 'support',
          support: 'support'
        };
        const laneMap = {
          'exp lane': 'exp',
          'mid lane': 'mid',
          'roam': 'roam',
          'jungle': 'jungle',
          'gold lane': 'gold'
        };

        const roles = rolesRaw
          .map(r => roleMap[r.toLowerCase()] || r.toLowerCase())
          .filter(Boolean)
          .join(', ') || undefined;
        const lanes = lanesRaw
          .map(l => laneMap[l.toLowerCase()] || l.toLowerCase())
          .filter(Boolean)
          .join(', ') || undefined;
        const counterTo = counterToRaw.filter(id => id > 0).slice(0, 2);
        const counteredBy = counteredByRaw.filter(id => id > 0).slice(0, 2);
        const compatibleWith = compatibleWithRaw.filter(id => id > 0).slice(0, 2);

        positionMap.set(heroId, {
          roles,
          lanes,
          counter_to: counterTo.length ? `{${counterTo.join(', ')}}` : undefined,
          countered_by: counteredBy.length ? `{${counteredBy.join(', ')}}` : undefined,
          compatible_with: compatibleWith.length ? `{${compatibleWith.join(', ')}}` : undefined
        });
      });

      console.log('Position Map:', JSON.stringify([...positionMap], null, 2));

      const heroIds = new Set([...rankMap.keys(), ...positionMap.keys()]);
      for (const heroId of heroIds) {
        const rankData = rankMap.get(heroId) || { pick_rate: null, ban_rate: null, win_rate: null };
        const positionData = positionMap.get(heroId) || { roles: undefined, lanes: undefined, counter_to: undefined, countered_by: undefined, compatible_with: undefined };

        const updatePayload = {};
        if (positionData.roles) updatePayload.roles = positionData.roles;
        if (positionData.lanes) updatePayload.lanes = positionData.lanes;
        if (positionData.counter_to) updatePayload.counter_to = positionData.counter_to;
        if (positionData.countered_by) updatePayload.countered_by = positionData.countered_by;
        if (positionData.compatible_with) updatePayload.compatible_with = positionData.compatible_with;
        if (rankData.pick_rate) updatePayload.pick_rate = rankData.pick_rate;
        if (rankData.ban_rate) updatePayload.ban_rate = rankData.ban_rate;
        if (rankData.win_rate) updatePayload.win_rate = rankData.win_rate;

        const { error, data: updateData } = await supabase
          .from('heroes')
          .update(updatePayload)
          .eq('hero_id', heroId)
          .select();
        if (error) {
          console.error(`Error updating hero ${heroId}:`, error);
          throw error;
        }
        console.log(`Updated hero ${heroId}:`, updateData);
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