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
    EmbedBuilder,
    ChannelType
} = require('discord.js');
const { WOMClient } = require('@wise-old-man/utils');

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers] });
const womClient = new WOMClient({ userAgent: 'Honey Trap Bot' }); 

const GROUP_ID = 25853; 

// --- STAFF ROLE CONFIGURATION FOR FAILED VERIFICATIONS ---
// Replace these with your actual Discord Role IDs
const GOLD_KEY_ROLE_ID = '1534942887765348473';
const SILVER_KEY_ROLE_ID = '1535009097705853058';
const MODERATOR_ROLE_ID = '1534942953640955949';

// --- IN-MEMORY CONFIGURATION ---
const guildConfigs = new Map();

function getConfig(guildId) {
    if (!guildConfigs.has(guildId)) {
        guildConfigs.set(guildId, { roleToGive: null, roleToRemove: null });
    }
    return guildConfigs.get(guildId);
}

// --- HELPER FUNCTION: Render Detailed Logger ---
function logEvent(action, user, details = '') {
    const timestamp = new Date().toISOString();
    const userInfo = user ? `[User: ${user.tag} | ID: ${user.id}]` : '[System]';
    console.log(`[${timestamp}] ${userInfo} ${action} ${details}`);
}
// ----------------------------------------------

client.on('interactionCreate', async interaction => {
    
    // 1. ADMIN COMMAND: Deploy the Admin Panel
    if (interaction.isChatInputCommand() && interaction.commandName === 'admin-panel') {
        logEvent('COMMAND_USED', interaction.user, '-> /admin-panel');
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
            logEvent('ADMIN_CONFIG_UPDATE', interaction.user, `-> Set RoleToGive: ${selectedRoleId}`);
            await interaction.reply({ content: `✅ Successfully set the **GIVEN** role to <@&${selectedRoleId}>.`, ephemeral: true });
        }

        if (interaction.customId === 'admin_set_remove_role') {
            config.roleToRemove = selectedRoleId;
            logEvent('ADMIN_CONFIG_UPDATE', interaction.user, `-> Set RoleToRemove: ${selectedRoleId}`);
            await interaction.reply({ content: `✅ Successfully set the **REMOVED** role to <@&${selectedRoleId}>.`, ephemeral: true });
        }
    }

    // 3. USER COMMAND: Deploy Verification Panel
    if (interaction.isChatInputCommand() && interaction.commandName === 'setup-panel') {
        logEvent('COMMAND_USED', interaction.user, '-> /setup-panel');
        if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
            return interaction.reply({ content: 'You do not have permission to set up the panel.', ephemeral: true });
        }

        const verifyBtn = new ButtonBuilder()
            .setCustomId('open_verify_modal')
            .setLabel('Verify RSN')
            .setStyle(ButtonStyle.Success);
        
        const row = new ActionRowBuilder().addComponents(verifyBtn);

        const panelEmbed = new EmbedBuilder()
            .setTitle('__***Honey Trap***__ Clan Verification')
            .setDescription('Welcome to the server! To gain full access, you must link your Discord account to your Old School RuneScape account.\n\nClick the **Verify RSN** button below and type your exact in-game name.')
            .setColor('#FFFF00')
            .setThumbnail('https://imgur.com/VHk74nK.jpg')
			.setImage('https://imgur.com/msNAMI7.jpg');

        await interaction.reply({ 
            embeds: [panelEmbed], 
            components: [row] 
        });
    }

    // 4. USER ACTION: Handle Button Click -> Open Modal
    if (interaction.isButton() && interaction.customId === 'open_verify_modal') {
        logEvent('BUTTON_CLICKED', interaction.user, '-> Opened RSN Modal');
        
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

    // 5. USER ACTION: Modal Submit -> WOM Check & Process
    if (interaction.isModalSubmit() && interaction.customId === 'rsn_modal') {
        const rsn = interaction.fields.getTextInputValue('rsn_input').trim().toLowerCase();
        logEvent('MODAL_SUBMITTED', interaction.user, `-> Entered RSN: "${rsn}"`);
        
        await interaction.deferReply({ ephemeral: true }); 
        const config = getConfig(interaction.guild.id);

        if (!config.roleToGive) {
            logEvent('VERIFICATION_ERROR', interaction.user, '-> Verification attempted before roles were configured.');
            return interaction.editReply('⚠️ The admins have not configured the verification roles yet. Please contact an admin!');
        }

        try {
            logEvent('API_REQUEST', interaction.user, `-> Querying Wise Old Man Group ID: ${GROUP_ID}`);
            const group = await womClient.groups.getGroupDetails(GROUP_ID);
            const isMember = group.memberships.some(m => m.player.username.toLowerCase() === rsn);

            if (isMember) {
                // --- SUCCESSFUL VERIFICATION ---
                logEvent('VERIFICATION_SUCCESS', interaction.user, `-> RSN "${rsn}" found in group!`);
                const member = interaction.member;
                
                await member.roles.add(config.roleToGive).catch(err => logEvent('ROLE_ADD_FAILED', interaction.user, err.message));
                if (config.roleToRemove) {
                    await member.roles.remove(config.roleToRemove).catch(err => logEvent('ROLE_REMOVE_FAILED', interaction.user, err.message));
                }

                await member.setNickname(rsn).catch(err => logEvent('NICKNAME_CHANGE_FAILED', interaction.user, err.message)); 

                await interaction.editReply(`Success! Your RSN **${rsn}** has been verified. Welcome to the clan!`);
            } else {
                // --- FAILED VERIFICATION: CREATE PRIVATE THREAD ---
                logEvent('VERIFICATION_FAILED', interaction.user, `-> RSN "${rsn}" NOT found in group.`);

                try {
                    // Create private thread in the channel where verification was triggered
                    const thread = await interaction.channel.threads.create({
                        name: `verify-${interaction.user.username}`,
                        type: ChannelType.PrivateThread,
                        reason: `Verification failed for RSN: ${rsn}`,
                    });

                    logEvent('THREAD_CREATED', interaction.user, `-> Private Thread Created: ${thread.name} (${thread.id})`);

                    // Add the user to the thread
                    await thread.members.add(interaction.user.id);

                    // Ping staff roles and the user inside the thread
                    const staffPings = `<@&${GOLD_KEY_ROLE_ID}> <@&${SILVER_KEY_ROLE_ID}> <@&${MODERATOR_ROLE_ID}>`;
                    await thread.send({
                        content: `Hello ${interaction.user}, your verification for RSN **${rsn}** was not found in the clan list on Wise Old Man.\n\n${staffPings} - Please assist with manually reviewing this verification.`
                    });

                    await interaction.editReply(`We couldn't find **${rsn}** in the clan logs. A private support thread (<#${thread.id}>) has been created for staff to assist you!`);
                } catch (threadError) {
                    logEvent('THREAD_CREATE_ERROR', interaction.user, `-> ${threadError.message}`);
                    await interaction.editReply(`We couldn't find **${rsn}** in the clan logs. Please contact staff directly for assistance.`);
                }
            }
        } catch (error) {
            logEvent('API_ERROR', interaction.user, `-> WOM API Error: ${error.message}`);
            await interaction.editReply('An error occurred contacting the Wise Old Man API. Please try again later.');
        }
    }
});

// --- DUMMY WEB SERVER FOR CLOUD HOSTING ---
const http = require('http');
http.createServer((req, res) => {
    res.write("I'm alive");
    res.end();
}).listen(process.env.PORT || 8080);

// --- Register Slash Commands ---
client.once('clientReady', async () => {
    logEvent('SYSTEM_START', null, `Logged in as ${client.user.tag}`);
    
    try {
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
        logEvent('SYSTEM_INFO', null, '✅ Slash commands registered successfully!');
    } catch (error) {
        logEvent('SYSTEM_ERROR', null, `Error registering commands: ${error.message}`);
    }
});

client.login(process.env.DISCORD_TOKEN);