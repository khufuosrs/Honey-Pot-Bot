require('dotenv').config();
const { 
    Client, 
    GatewayIntentBits, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    ModalBuilder, 
    TextInputBuilder, 
    TextInputStyle,
    RoleSelectMenuBuilder,
    PermissionsBitField,
	EmbedBuilder
} = require('discord.js');
const { WOMClient } = require('@wise-old-man/utils');

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers] });
const womClient = new WOMClient({ userAgent: 'Honey Trap Bot' }); 

const GROUP_ID = 25853; 

// --- IN-MEMORY CONFIGURATION ---
const guildConfigs = new Map();

function getConfig(guildId) {
    if (!guildConfigs.has(guildId)) {
        guildConfigs.set(guildId, { roleToGive: null, roleToRemove: null });
    }
    return guildConfigs.get(guildId);
}
// -------------------------------

client.on('interactionCreate', async interaction => {
    
    // 1. ADMIN COMMAND: Deploy the Admin Panel
    if (interaction.isChatInputCommand() && interaction.commandName === 'admin-panel') {
        if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
            return interaction.reply({ content: 'You do not have permission to use this command.', ephemeral: true });
        }

        const giveRoleMenu = new RoleSelectMenuBuilder()
            .setCustomId('admin_set_give_role')
            .setPlaceholder('Select the role to GIVE upon verification');

        const removeRoleMenu = new RoleSelectMenuBuilder()
            .setCustomId('admin_set_remove_role')
            .setPlaceholder('Select the role to REMOVE upon verification');

        const row1 = new ActionRowBuilder().addComponents(giveRoleMenu);
        const row2 = new ActionRowBuilder().addComponents(removeRoleMenu);

        await interaction.reply({ 
            content: '**⚙️ Verification Admin Panel**\nUse the drop-down menus below to configure the verification roles.', 
            components: [row1, row2],
            ephemeral: true 
        });
    }

    // 2. ADMIN PANEL: Handle Drop-down Selections
    if (interaction.isRoleSelectMenu()) {
        const config = getConfig(interaction.guild.id);
        const selectedRoleId = interaction.values[0];

        if (interaction.customId === 'admin_set_give_role') {
            config.roleToGive = selectedRoleId;
            await interaction.reply({ content: `✅ Successfully set the **GIVEN** role to <@&${selectedRoleId}>.`, ephemeral: true });
        }

        if (interaction.customId === 'admin_set_remove_role') {
            config.roleToRemove = selectedRoleId;
            await interaction.reply({ content: `✅ Successfully set the **REMOVED** role to <@&${selectedRoleId}>.`, ephemeral: true });
        }
    }

    // 3. USER COMMAND: Deploy Verification Panel
    if (interaction.isChatInputCommand() && interaction.commandName === 'setup-panel') {
        if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
            return interaction.reply({ content: 'You do not have permission to set up the panel.', ephemeral: true });
        }

        const verifyBtn = new ButtonBuilder()
            .setCustomId('open_verify_modal')
            .setLabel('Verify RSN')
            .setStyle(ButtonStyle.Success);
        
        const row = new ActionRowBuilder().addComponents(verifyBtn);

        // --- THE EMBED BUILDER ---
        const panelEmbed = new EmbedBuilder()
            .setTitle('__***Honey Trap***__ Clan Verification')
            .setDescription('Welcome to the server! To gain full access, you must link your Discord account to your Old School RuneScape account.\n\nClick the **Verify RSN** button below and type your exact in-game name.')
            .setColor('#FFFF00')
            .setThumbnail('https://imgur.com/VHk74nK.jpg')
			.setImage('https://imgur.com/QT64q65.jpg')
            .setFooter({ text: 'Honey Trap' });

        // Send the embed instead of plain text content
        await interaction.reply({ 
            embeds: [panelEmbed], 
            components: [row] 
        });
    }

    // 4. USER ACTION: Handle Button Click -> Modal
    if (interaction.isButton() && interaction.customId === 'open_verify_modal') {
        const modal = new ModalBuilder()
            .setCustomId('rsn_modal')
            .setTitle('Clan Verification');

        const rsnInput = new TextInputBuilder()
            .setCustomId('rsn_input')
            .setLabel('What is your exact RSN?')
            .setStyle(TextInputStyle.Short)
            .setRequired(true);

        const row = new ActionRowBuilder().addComponents(rsnInput);
        modal.addComponents(row);

        await interaction.showModal(modal);
    }

    // 5. USER ACTION: Modal Submit -> WOM Check
    if (interaction.isModalSubmit() && interaction.customId === 'rsn_modal') {
        await interaction.deferReply({ ephemeral: true }); 
        const rsn = interaction.fields.getTextInputValue('rsn_input').trim().toLowerCase();
        const config = getConfig(interaction.guild.id);

        if (!config.roleToGive) {
            return interaction.editReply('⚠️ The admins have not configured the verification roles yet. Please contact an admin!');
        }

        try {
            const group = await womClient.groups.getGroupDetails(GROUP_ID);
            const isMember = group.memberships.some(m => m.player.username.toLowerCase() === rsn);

            if (isMember) {
                const member = interaction.member;
                
                await member.roles.add(config.roleToGive).catch(console.error);
                if (config.roleToRemove) {
                    await member.roles.remove(config.roleToRemove).catch(console.error);
                }

                await member.setNickname(rsn).catch(console.error); 

                await interaction.editReply(`Success! Your RSN **${rsn}** has been verified. Welcome to the clan!`);
            } else {
                await interaction.editReply(`We couldn't find **${rsn}** in the clan logs. Make sure you've been accepted in-game first, or contact staff.`);
            }
        } catch (error) {
            console.error(error);
            await interaction.editReply('An error occurred contacting the Wise Old Man API. Please try again later.');
        }
    }
});

// --- Register Slash Commands ---
client.once('clientReady', async () => {
    console.log(`Bot is online! Logged in as ${client.user.tag}`);
    
    try {
        console.log('Registering slash commands...');
        await client.application.commands.set([
            {
                name: 'setup-panel',
                description: 'Deploy the clan verification panel (Admin only)'
            },
            {
                name: 'admin-panel',
                description: 'Configure verification roles (Admin only)'
            }
        ]);
        console.log('✅ Slash commands registered successfully!');
    } catch (error) {
        console.error('⚠️ Error registering commands:', error);
    }
});

client.login(process.env.DISCORD_TOKEN);

// --- DUMMY WEB SERVER FOR CLOUD HOSTING ---
const http = require('http');
http.createServer((req, res) => {
    res.write("I'm alive");
    res.end();
}).listen(process.env.PORT || 8080);