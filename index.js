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
    ChannelType,
    ApplicationCommandOptionType,
    MessageFlags
} = require('discord.js');
const { WOMClient } = require('@wise-old-man/utils');

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers] });
const womClient = new WOMClient({ userAgent: 'Honey Trap Bot' }); 

const GROUP_ID = 25853; 

// --- STAFF, ENTRY, FLAGGED, & LOG ROLE CONFIGURATION ---
const GOLD_KEY_ROLE_ID = '1534942887765348473';
const SILVER_KEY_ROLE_ID = '1535009097705853058';
const MODERATOR_ROLE_ID = '1534942953640955949';
const ENTRY_ROLE_ID = '1535176809195503667'; 
const FLAGGED_ROLE_ID = '1535508809118781491'; 
const LOG_CHANNEL_ID = '1536091974547808420';

// --- IN-MEMORY CONFIGURATION ---
const guildConfigs = new Map();

function getConfig(guildId) {
    if (!guildConfigs.has(guildId)) {
        guildConfigs.set(guildId, { roleToGive: null, roleToRemove: null });
    }
    return guildConfigs.get(guildId);
}

// --- HELPER FUNCTION: Render Console Logger ---
function logEvent(action, user, details = '') {
    const timestamp = new Date().toISOString();
    const userInfo = user ? `[User: ${user.tag} | ID: ${user.id}]` : '[System]';
    console.log(`[${timestamp}] ${userInfo} ${action} ${details}`);
}

// --- HELPER FUNCTION: Discord Channel Logger ---
async function sendDiscordLog(interaction, title, description, color) {
    try {
        const logChannel = interaction.guild.channels.cache.get(LOG_CHANNEL_ID);
        if (!logChannel) {
            console.log('⚠️ Could not find the Discord log channel. Check your LOG_CHANNEL_ID.');
            return; 
        }

        const logEmbed = new EmbedBuilder()
            .setTitle(title)
            .setDescription(description)
            .setColor(color)
            .setTimestamp()
            .setFooter({ text: `Discord ID: ${interaction.user.id}` });

        await logChannel.send({ embeds: [logEmbed] });
    } catch (error) {
        console.error("❌ Failed to send log to Discord channel:", error.message);
    }
}
// ----------------------------------------------

client.on('interactionCreate', async interaction => {
    
    // ==========================================
    // ADMIN PANEL & SETUP COMMANDS
    // ==========================================
    if (interaction.isChatInputCommand() && interaction.commandName === 'admin-panel') {
        logEvent('COMMAND_USED', interaction.user, '-> /admin-panel');
        if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
            return interaction.reply({ content: 'You do not have permission to use this command.', flags: MessageFlags.Ephemeral });
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
            flags: MessageFlags.Ephemeral 
        });
    }

    if (interaction.isChatInputCommand() && interaction.commandName === 'setup-panel') {
        logEvent('COMMAND_USED', interaction.user, '-> /setup-panel');
        if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
            return interaction.reply({ content: 'You do not have permission to set up the panel.', flags: MessageFlags.Ephemeral });
        }

        const verifyBtn = new ButtonBuilder()
            .setCustomId('open_verify_modal')
            .setLabel('Verify RSN')
            .setStyle(ButtonStyle.Success);
        
        const row = new ActionRowBuilder().addComponents(verifyBtn);

		const panelEmbed = new EmbedBuilder()
            .setTitle('__***Honey Trap***__ Clan Verification')
            .setDescription('Welcome to the server! To gain full access, you must link your Discord account to your Old School RuneScape account.\n\nClick the **Verify RSN** button below and type your exact in-game name.')
            .setColor('#EBA937')
            .setThumbnail('https://imgur.com/VHk74nK.jpg')
			.setImage('https://imgur.com/msNAMI7.jpg');

        await interaction.reply({ 
            embeds: [panelEmbed], 
            components: [row] 
        });
    }

    // ==========================================
    // ADMIN COMMAND: /manual-verify
    // ==========================================
    if (interaction.isChatInputCommand() && interaction.commandName === 'manual-verify') {
        logEvent('COMMAND_USED', interaction.user, '-> /manual-verify');
        if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
            return interaction.reply({ content: 'You do not have permission to use this command.', flags: MessageFlags.Ephemeral });
        }

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const targetMember = interaction.options.getMember('user');
        const rsn = interaction.options.getString('rsn').trim();
        const config = getConfig(interaction.guild.id);

        if (!config.roleToGive) {
            return interaction.editReply('⚠️ The admins have not configured the verification roles yet. Please run `/admin-panel` first!');
        }

        try {
            await targetMember.roles.add(config.roleToGive);
            if (config.roleToRemove) await targetMember.roles.remove(config.roleToRemove);
            await targetMember.setNickname(rsn);

            logEvent('MANUAL_VERIFY_SUCCESS', interaction.user, `-> Verified ${targetMember.user.tag} as "${rsn}"`);
            
            // --- NEW: Send to #verify-logs ---
            await sendDiscordLog(
                interaction, 
                '🛠️ Manual Verification', 
                `**Admin:** ${interaction.user}\n**Verified User:** ${targetMember.user}\n**Assigned RSN:** \`${rsn}\``, 
                '#3498DB' // Blue color
            );
            // ---------------------------------

            await interaction.editReply(`✅ Successfully verified <@${targetMember.id}> as **${rsn}** manually.`);
        } catch (error) {
            logEvent('MANUAL_VERIFY_ERROR', interaction.user, `-> ${error.message}`);
            await interaction.editReply(`❌ Error applying roles/nickname: ${error.message}\n*(Make sure the bot's role is higher than the user's role!)*`);
        }
    }

    // ==========================================
    // ADMIN COMMAND: /audit
    // ==========================================
    if (interaction.isChatInputCommand() && interaction.commandName === 'audit') {
        logEvent('COMMAND_USED', interaction.user, '-> /audit');
        if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
            return interaction.reply({ content: 'You do not have permission to use this command.', flags: MessageFlags.Ephemeral });
        }

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const config = getConfig(interaction.guild.id);

        if (!config.roleToGive) {
            return interaction.editReply('⚠️ You must run `/admin-panel` and set the verified role before you can audit it!');
        }

        try {
            logEvent('AUDIT_STARTED', interaction.user, `-> Fetching WOM and Discord Members...`);
            const group = await womClient.groups.getGroupDetails(GROUP_ID);
            const womMembers = group.memberships.map(m => m.player.username.toLowerCase());

            const guildMembers = await interaction.guild.members.fetch();
            const verifiedMembers = guildMembers.filter(m => m.roles.cache.has(config.roleToGive));

            let flaggedCount = 0;
            let flaggedNames = [];

            for (const [id, member] of verifiedMembers) {
                const currentName = (member.nickname || member.user.displayName).toLowerCase();
                
                if (!womMembers.includes(currentName)) {
                    await member.roles.add(FLAGGED_ROLE_ID).catch(err => logEvent('FLAG_ERROR', interaction.user, `Failed to flag ${currentName}: ${err.message}`));
                    flaggedCount++;
                    flaggedNames.push(currentName);
                }
            }

            logEvent('AUDIT_COMPLETE', interaction.user, `-> Flagged ${flaggedCount} members.`);
            
            if (flaggedCount === 0) {
                await interaction.editReply('✅ Audit complete! All verified Discord members are present in the Wise Old Man clan list.');
            } else {
                await interaction.editReply(`⚠️ **Audit Complete!**\nFlagged **${flaggedCount}** members who are no longer in the WOM clan list.\n\nNames flagged: ${flaggedNames.join(', ')}`);
            }
        } catch (error) {
            logEvent('AUDIT_ERROR', interaction.user, `-> ${error.message}`);
            await interaction.editReply('❌ An error occurred during the audit. Check the Railway logs for details.');
        }
    }

    // ==========================================
    // ADMIN COMMAND: /purge
    // ==========================================
    if (interaction.isChatInputCommand() && interaction.commandName === 'purge') {
        logEvent('COMMAND_USED', interaction.user, '-> /purge');
        if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
            return interaction.reply({ content: 'You do not have permission to use this command.', flags: MessageFlags.Ephemeral });
        }

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        try {
            const guildMembers = await interaction.guild.members.fetch();
            const flaggedMembers = guildMembers.filter(m => m.roles.cache.has(FLAGGED_ROLE_ID));

            if (flaggedMembers.size === 0) {
                return interaction.editReply('There is no one currently flagged for purging.');
            }

            let kickedCount = 0;
            for (const [id, member] of flaggedMembers) {
                await member.kick('Purged via Admin Audit Command').catch(err => logEvent('KICK_ERROR', interaction.user, `Failed to kick ${member.user.tag}: ${err.message}`));
                kickedCount++;
            }

            logEvent('PURGE_COMPLETE', interaction.user, `-> Kicked ${kickedCount} members.`);
            await interaction.editReply(`✅ Successfully purged **${kickedCount}** flagged members from the server.`);
        } catch (error) {
            logEvent('PURGE_ERROR', interaction.user, `-> ${error.message}`);
            await interaction.editReply('❌ An error occurred while purging members. Check the Railway logs.');
        }
    }

    // ==========================================
    // DROP-DOWN & BUTTON HANDLERS
    // ==========================================
    if (interaction.isRoleSelectMenu()) {
        const config = getConfig(interaction.guild.id);
        const selectedRoleId = interaction.values[0];

        if (interaction.customId === 'admin_set_give_role') {
            config.roleToGive = selectedRoleId;
            logEvent('ADMIN_CONFIG_UPDATE', interaction.user, `-> Set RoleToGive: ${selectedRoleId}`);
            await interaction.reply({ content: `✅ Successfully set the **GIVEN** role to <@&${selectedRoleId}>.`, flags: MessageFlags.Ephemeral });
        }

        if (interaction.customId === 'admin_set_remove_role') {
            config.roleToRemove = selectedRoleId;
            logEvent('ADMIN_CONFIG_UPDATE', interaction.user, `-> Set RoleToRemove: ${selectedRoleId}`);
            await interaction.reply({ content: `✅ Successfully set the **REMOVED** role to <@&${selectedRoleId}>.`, flags: MessageFlags.Ephemeral });
        }
    }

    if (interaction.isButton() && interaction.customId === 'open_verify_modal') {
        logEvent('BUTTON_CLICKED', interaction.user, '-> Clicked Verify Button');

        if (!interaction.member.roles.cache.has(ENTRY_ROLE_ID)) {
            logEvent('VERIFY_DENIED', interaction.user, '-> User lacks the required Entry Rank to use the panel.');
            return interaction.reply({ 
                content: '⚠️ You do not have the required Entry rank to use this verification panel.', 
                flags: MessageFlags.Ephemeral 
            });
        }
        
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

    // ==========================================
    // MODAL SUBMIT HANDLER (WOM CHECK WITH CASING)
    // ==========================================
    if (interaction.isModalSubmit() && interaction.customId === 'rsn_modal') {
        const userInputRsn = interaction.fields.getTextInputValue('rsn_input').trim();
        const searchRsn = userInputRsn.toLowerCase();
        
        logEvent('MODAL_SUBMITTED', interaction.user, `-> Entered RSN: "${userInputRsn}"`);
        
        await interaction.deferReply({ flags: MessageFlags.Ephemeral }); 
        const config = getConfig(interaction.guild.id);

        if (!config.roleToGive) {
            logEvent('VERIFICATION_ERROR', interaction.user, '-> Verification attempted before roles were configured.');
            return interaction.editReply('⚠️ The admins have not configured the verification roles yet. Please contact an admin!');
        }

        try {
            logEvent('API_REQUEST', interaction.user, `-> Querying Wise Old Man Group ID: ${GROUP_ID}`);
            const group = await womClient.groups.getGroupDetails(GROUP_ID);
            const matchedMember = group.memberships.find(m => m.player.username.toLowerCase() === searchRsn);

            if (matchedMember) {
                const officialRsn = matchedMember.player.displayName;

                logEvent('VERIFICATION_SUCCESS', interaction.user, `-> RSN "${officialRsn}" found in group!`);
                const member = interaction.member;
                
                await member.roles.add(config.roleToGive).catch(err => logEvent('ROLE_ADD_FAILED', interaction.user, err.message));
                if (config.roleToRemove) {
                    await member.roles.remove(config.roleToRemove).catch(err => logEvent('ROLE_REMOVE_FAILED', interaction.user, err.message));
                }

                await member.setNickname(officialRsn).catch(err => logEvent('NICKNAME_CHANGE_FAILED', interaction.user, err.message)); 

                // --- NEW: Send Success Log to #verify-logs ---
                await sendDiscordLog(
                    interaction, 
                    '✅ Verification Success', 
                    `**User:** ${interaction.user}\n**Verified RSN:** \`${officialRsn}\``, 
                    '#2ECC71' // Green color
                );
                // ---------------------------------------------

                await interaction.editReply(`Success! Your RSN **${officialRsn}** has been verified. Welcome to the clan!`);
            } else {
                logEvent('VERIFICATION_FAILED', interaction.user, `-> RSN "${userInputRsn}" NOT found in group.`);

                try {
                    const thread = await interaction.channel.threads.create({
                        name: `verify-${interaction.user.username}`,
                        type: ChannelType.PrivateThread,
                        reason: `Verification failed for RSN: ${userInputRsn}`,
                    });

                    logEvent('THREAD_CREATED', interaction.user, `-> Private Thread Created: ${thread.name} (${thread.id})`);

                    await thread.members.add(interaction.user.id);

                    const staffPings = `<@&${GOLD_KEY_ROLE_ID}> <@&${SILVER_KEY_ROLE_ID}> <@&${MODERATOR_ROLE_ID}>`;
                    await thread.send({
                        content: `Hello ${interaction.user}, your verification for RSN **${userInputRsn}** was not found in the clan list on Wise Old Man.\n\n${staffPings} - Please assist with manually reviewing this verification.`
                    });

                    // --- NEW: Send Failure Log to #verify-logs ---
                    await sendDiscordLog(
                        interaction, 
                        '❌ Verification Failed', 
                        `**User:** ${interaction.user}\n**Attempted RSN:** \`${userInputRsn}\`\n**Result:** Not found on WOM. Private support thread <#${thread.id}> created.`, 
                        '#E74C3C' // Red color
                    );
                    // ---------------------------------------------

                    await interaction.editReply(`We couldn't find **${userInputRsn}** in the clan logs. A private support thread (<#${thread.id}>) has been created for staff to assist you!`);
                } catch (threadError) {
                    logEvent('THREAD_CREATE_ERROR', interaction.user, `-> ${threadError.message}`);
                    await interaction.editReply(`We couldn't find **${userInputRsn}** in the clan logs. Please contact staff directly for assistance.`);
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
            { name: 'setup-panel', description: 'Deploy the clan verification panel (Admin only)' },
            { name: 'admin-panel', description: 'Configure verification roles (Admin only)' },
            {
                name: 'manual-verify',
                description: 'Manually verify a user and set their RSN (Admin only)',
                options: [
                    { name: 'user', description: 'The Discord user to verify', type: ApplicationCommandOptionType.User, required: true },
                    { name: 'rsn', description: 'The exact in-game name of the user', type: ApplicationCommandOptionType.String, required: true }
                ]
            },
            { name: 'audit', description: 'Audit verified members against the live WOM clan list (Admin only)' },
            { name: 'purge', description: 'Kick all members who have the Flagged role from the server (Admin only)' }
        ]);
        logEvent('SYSTEM_INFO', null, '✅ Slash commands registered successfully!');
    } catch (error) {
        logEvent('SYSTEM_ERROR', null, `Error registering commands: ${error.message}`);
    }
});

client.login(process.env.DISCORD_TOKEN);