const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('chat')
    .setDescription('Chat with AI')
    .addStringOption(option =>
      option
        .setName('message')
        .setDescription('Your message to the AI')
        .setRequired(true)
    ),
  async execute(interaction) {
    await interaction.deferReply();

    const { user } = interaction;
    const messageContent = interaction.options.getString('message');

    // Load environment variables
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      const errorEmbed = new EmbedBuilder()
        .setColor('#FF0000')
        .setTitle('❌ Configuration Error')
        .setDescription('The AI API key is not configured.')
        .setFooter({ text: 'Dungeon Adventure' });
      await interaction.editReply({ embeds: [errorEmbed] });
      return;
    }

    try {
      // Dynamically import node-fetch
      const { default: fetch } = await import('node-fetch');

      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'moonshotai/kimi-k2:free',
          messages: [
            {
              role: 'user',
              content: messageContent
            }
          ]
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMessage = errorData.error?.message || `HTTP Error: ${response.status}`;
        const errorEmbed = new EmbedBuilder()
          .setColor('#FF0000')
          .setTitle('❌ AI Chat Error')
          .setDescription(`Failed to get a response from AI: ${errorMessage}`)
          .setFooter({ text: 'Dungeon Adventure' });
        await interaction.editReply({ embeds: [errorEmbed] });
        return;
      }

      const data = await response.json();
      const aiResponse = data.choices?.[0]?.message?.content || 'No response from the AI.';

      // Truncate question and response for embed
      const maxQuestionLength = 100;
      const truncatedQuestion = messageContent.length > maxQuestionLength ? `${messageContent.slice(0, maxQuestionLength - 3)}...` : messageContent;
      const maxResponseLength = 4096 - (truncatedQuestion.length + 50); // Account for question and formatting
      const truncatedResponse = aiResponse.length > maxResponseLength ? `${aiResponse.slice(0, maxResponseLength - 3)}...` : aiResponse;

      const successEmbed = new EmbedBuilder()
        .setColor('#00FF00')
        .setTitle('🪶 Chatbot Service! 🪶')
        .setDescription(`💬 **You asked**: ${truncatedQuestion}\n\n🤖 **AI says**: ${truncatedResponse}`)
        .setFooter({ text: `Requested by ${user.username} | Dungeon Adventure` });

      await interaction.editReply({ embeds: [successEmbed] });
    } catch (error) {
      console.error('Error in chat command:', error);
      const errorEmbed = new EmbedBuilder()
        .setColor('#FF0000')
        .setTitle('❌ Error')
        .setDescription('An unexpected error occurred while contacting the AI.')
        .setFooter({ text: 'Dungeon Adventure' });
      await interaction.editReply({ embeds: [errorEmbed] });
    }
  }
};