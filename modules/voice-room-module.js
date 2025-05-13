// modules/voice-room-module.js - 보이스룸 통합 모듈
const { 
    EmbedBuilder, 
    ActionRowBuilder,
    StringSelectMenuBuilder,
    ButtonBuilder,
    ButtonStyle,
    ModalBuilder, 
    TextInputBuilder, 
    TextInputStyle,
    PermissionFlagsBits,
    ChannelType,
    Events
  } = require('discord.js');
  require('dotenv').config();
  
  /**
   * 보이스룸 관리 모듈
   * @param {Client} client - Discord 클라이언트 객체
   * @returns {Object} 모듈 객체
   */
  module.exports = {
    name: 'voice-room-module',
    description: '사용자별 커스텀 보이스룸 생성 및 관리 기능',
    
    // 현재 생성된 음성 채널 추적 (채널ID -> 생성자정보)
    activeVoiceRooms: new Map(),
    
    /**
     * 모듈 초기화 함수
     * @param {Client} client - Discord 클라이언트 객체
     */
    init: (client) => {
      try {
        console.log('🔍 보이스룸 모듈: 초기화 중...');
        
        // 환경변수 유효성 검사
        const categoryId = process.env.VOICE_CATEGORY_ID;
        const lobbyId = process.env.VOICE_LOBBY_ID;
        
        if (!categoryId || !lobbyId) {
          console.error('❌ 보이스룸 모듈: 필수 환경변수가 설정되지 않았습니다. (VOICE_CATEGORY_ID, VOICE_LOBBY_ID)');
          return;
        }
        
        // 이벤트 리스너 등록 - 음성 상태 변경
        client.on(Events.VoiceStateUpdate, async (oldState, newState) => {
          try {
            // 로비 채널에 입장한 경우 (이전에 다른 채널이었거나 없었던 경우)
            if (newState.channelId === lobbyId && oldState.channelId !== lobbyId) {
              await module.exports.createVoiceRoom(newState);
            }
            
            // 빈 보이스룸 정리
            module.exports.cleanupEmptyVoiceRooms(oldState);
          } catch (error) {
            console.error('❌ 보이스룸 모듈: 음성 상태 처리 중 오류 발생:', error);
          }
        });
        
        // 이벤트 리스너 등록 - 인터랙션 처리
        client.on(Events.InteractionCreate, async (interaction) => {
          try {
            // 버튼 인터랙션
            if (interaction.isButton() && interaction.customId.startsWith('voiceroom_')) {
              await module.exports.handleButtonInteraction(interaction);
            }
            
            // 셀렉트 메뉴 인터랙션
            else if (interaction.isStringSelectMenu() && interaction.customId.startsWith('voiceroom_')) {
              await module.exports.handleSelectMenuInteraction(interaction);
            }
            
            // 모달 제출 인터랙션
            else if (interaction.isModalSubmit() && interaction.customId.startsWith('voiceroom_')) {
              await module.exports.handleModalSubmitInteraction(interaction);
            }
          } catch (error) {
            console.error('❌ 보이스룸 모듈: 인터랙션 처리 중 오류 발생:', error);
            
            // 응답이 아직 전송되지 않은 경우 오류 메시지 전송
            if (!interaction.replied && !interaction.deferred) {
              await interaction.reply({
                content: '⚠️ 명령어 처리 중 오류가 발생했습니다.',
                ephemeral: true
              }).catch(() => {});
            }
          }
        });
        
        console.log('✅ 보이스룸 모듈이 초기화되었습니다.');
      } catch (error) {
        console.error('❌ 보이스룸 모듈: 초기화 중 오류 발생:', error);
      }
    },
    
    /**
     * 보이스룸 생성 함수
     * @param {VoiceState} voiceState - 음성 상태 객체
     */
    createVoiceRoom: async (voiceState) => {
      try {
        const { guild, member } = voiceState;
        
        // 환경변수에서 카테고리 ID 가져오기
        const categoryId = process.env.VOICE_CATEGORY_ID;
        
        // 카테고리 확인
        const category = guild.channels.cache.get(categoryId);
        if (!category) {
          console.error(`❌ 보이스룸 모듈: 카테고리를 찾을 수 없습니다: ${categoryId}`);
          return;
        }
        
        // 사용자 이름 (별명 우선)
        const userName = member.nickname || member.user.username;
        
        // 채널 생성
        const voiceChannel = await guild.channels.create({
          name: `🔊 ${userName}님의 방`,
          type: ChannelType.GuildVoice,
          parent: category.id,
          permissionOverwrites: [
            {
              id: guild.id, // @everyone
              allow: [PermissionFlagsBits.Connect, PermissionFlagsBits.Speak]
            },
            {
              id: member.id, // 생성자
              allow: [
                PermissionFlagsBits.Connect, 
                PermissionFlagsBits.Speak,
                PermissionFlagsBits.MuteMembers,
                PermissionFlagsBits.DeafenMembers,
                PermissionFlagsBits.ManageChannels,
                PermissionFlagsBits.MoveMembers
              ]
            }
          ]
        });
        
        console.log(`✅ 보이스룸 모듈: ${userName}님의 보이스룸이 생성되었습니다.`);
        
        // 활성 보이스룸 맵에 추가
        module.exports.activeVoiceRooms.set(voiceChannel.id, {
          ownerId: member.id,
          createdAt: Date.now(),
          type: 'default',
          nameChanges: 0 // 이름 변경 횟수 추적
        });
        
        // 사용자를 새 채널로 이동
        await member.voice.setChannel(voiceChannel);
        
        // DM으로 컨트롤 패널 전송
        module.exports.sendControlPanel(member.user, voiceChannel);
      } catch (error) {
        console.error('❌ 보이스룸 모듈: 음성 채널 생성 중 오류 발생:', error);
      }
    },
    
    /**
     * 컨트롤 패널 전송
     * @param {User} user - 사용자 객체
     * @param {VoiceChannel} voiceChannel - 음성 채널 객체
     */
    sendControlPanel: async (user, voiceChannel) => {
      try {
        // 임베드 생성
        const embed = new EmbedBuilder()
          .setAuthor({ 
            name: 'DV BOT', 
            iconURL: 'https://i.imgur.com/AxeBESV.png' 
          })
          .setTitle('🔊 보이스룸 컨트롤 패널')
          .setDescription('아래 메뉴를 통해 보이스룸을 관리할 수 있습니다.')
          .addFields(
            { name: '🔔 통화방 권한 확인', value: '현재 통화방에 대한 권한을 확인합니다.' },
            { name: '🔕 통화방 권한 양도', value: '통화방 권한을 다른 사용자에게 양도합니다.' },
            { name: '🔊 통화방 이름 변경', value: '통화방의 이름을 변경합니다.' },
            { name: '👥 채널 유형 변경', value: '보이스룸의 유형을 선택하세요.' },
            { name: '❗ 주의사항', value: '통화방 이름변경은 총 2회까지 가능합니다.' }
          )
          .setImage('https://i.imgur.com/WQ1csTo.png')
          .setColor('#3498DB')
          .setThumbnail(voiceChannel.guild.iconURL({ dynamic: true }))
          .setFooter({
            text: voiceChannel.guild.name,
            iconURL: 'https://i.imgur.com/AxeBESV.png'
          })
          .setTimestamp();
        
        // 드롭다운 메뉴 생성
        const roomTypeRow = new ActionRowBuilder()
          .addComponents(
            new StringSelectMenuBuilder()
              .setCustomId(`voiceroom_type_${voiceChannel.id}`)
              .setPlaceholder('통화방 유형을 선택해주세요')
              .addOptions([
                {
                  label: 'Free-talk',
                  description: '일반적인 대화를 위한 채널로 설정합니다.',
                  value: 'general',
                  emoji: '💬'
                },
                {
                  label: '배틀룸',
                  description: '훈련/막피/정규전을 위한 채널로 설정합니다.',
                  value: 'gaming',
                  emoji: '🐴'
                },
                {
                  label: '검은발톱',
                  description: '검은 발톱을 위한 채널로 설정합니다.',
                  value: 'music',
                  emoji: '🏴'
                },
                {
                  label: '스터디룸',
                  description: 'OT/훈련을 위한 채널로 설정합니다.',
                  value: 'study',
                  emoji: '📚'
                },
                {
                  label: '회의실',
                  description: '회의를 위한 채널로 설정합니다.',
                  value: 'meeting',
                  emoji: '🗣️'
                }
              ])
          );
        
        // 버튼 생성
        const buttonRow = new ActionRowBuilder()
          .addComponents(
            new ButtonBuilder()
              .setCustomId(`voiceroom_check_${voiceChannel.id}`)
              .setLabel('권한 확인')
              .setStyle(ButtonStyle.Primary)
              .setEmoji('🔔'),
            new ButtonBuilder()
              .setCustomId(`voiceroom_transfer_${voiceChannel.id}`)
              .setLabel('권한 양도')
              .setStyle(ButtonStyle.Success)
              .setEmoji('🔕'),
            new ButtonBuilder()
              .setCustomId(`voiceroom_rename_${voiceChannel.id}`)
              .setLabel('이름 변경')
              .setStyle(ButtonStyle.Secondary)
              .setEmoji('✏️')
          );
        
        // DM 전송
        await user.send({ 
          embeds: [embed], 
          components: [roomTypeRow, buttonRow] 
        });
        
        console.log(`✅ 보이스룸 모듈: ${user.tag}님에게 보이스룸 컨트롤 패널을 전송했습니다.`);
      } catch (error) {
        console.error('❌ 보이스룸 모듈: 컨트롤 패널 전송 중 오류 발생:', error);
      }
    },
    
    /**
     * 빈 보이스룸 정리
     * @param {VoiceState} oldState - 이전 음성 상태 객체
     */
    cleanupEmptyVoiceRooms: async (oldState) => {
      try {
        // 채널이 없거나, 사용자가 퇴장하지 않았으면 무시
        if (!oldState.channel) return;
        
        const channelId = oldState.channel.id;
        
        // 활성 보이스룸에 등록된 채널인지 확인
        if (!module.exports.activeVoiceRooms.has(channelId)) return;
        
        // 채널에 남은 인원이 있는지 확인
        if (oldState.channel.members.size === 0) {
          // 채널 삭제
          await oldState.channel.delete();
          
          // 활성 보이스룸에서 제거
          module.exports.activeVoiceRooms.delete(channelId);
          
          console.log(`✅ 보이스룸 모듈: 빈 보이스룸을 삭제했습니다: ${oldState.channel.name}`);
        }
      } catch (error) {
        console.error('❌ 보이스룸 모듈: 보이스룸 정리 중 오류 발생:', error);
      }
    },
    
    /**
     * 버튼 인터랙션 처리
     * @param {ButtonInteraction} interaction - 버튼 인터랙션 객체
     */
    handleButtonInteraction: async (interaction) => {
      const { customId, user } = interaction;
      
      // 커스텀 ID 파싱 (형식: voiceroom_action_channelId)
      const [, action, channelId] = customId.split('_');
      
      // 채널 가져오기
      const channel = interaction.client.channels.cache.get(channelId);
      
      // 채널이 존재하지 않거나 권한이 없는 경우
      if (!channel) {
        await interaction.reply({
          content: '⚠️ 해당 보이스룸이 더 이상 존재하지 않습니다.',
          ephemeral: true
        });
        return;
      }
      
      // 보이스룸 정보 가져오기
      const voiceRoomInfo = module.exports.activeVoiceRooms.get(channelId);
      
      // 정보가 없거나 소유자가 아닌 경우
      if (!voiceRoomInfo || voiceRoomInfo.ownerId !== user.id) {
        await interaction.reply({
          content: '⚠️ 이 보이스룸에 대한 권한이 없습니다.',
          ephemeral: true
        });
        return;
      }
      
      // 권한 확인
      if (action === 'check') {
        await module.exports.handlePermissionCheck(interaction, channel);
        return;
      }
      
      // 권한 양도
      if (action === 'transfer') {
        await module.exports.handlePermissionTransfer(interaction, channel);
        return;
      }
      
      // 이름 변경
      if (action === 'rename') {
        await module.exports.showRenameModal(interaction, channelId);
        return;
      }
    },
    
    /**
     * 셀렉트 메뉴 인터랙션 처리
     * @param {SelectMenuInteraction} interaction - 셀렉트 메뉴 인터랙션 객체
     */
    handleSelectMenuInteraction: async (interaction) => {
      const { customId, values, user } = interaction;
      
      // 커스텀 ID 파싱
      const parts = customId.split('_');
      const action = parts[1];
      const channelId = parts[parts.length - 1];
      
      // 채널 가져오기
      const channel = interaction.client.channels.cache.get(channelId);
      
      // 채널이 존재하지 않는 경우
      if (!channel) {
        await interaction.reply({
          content: '⚠️ 해당 보이스룸이 더 이상 존재하지 않습니다.',
          ephemeral: true
        });
        return;
      }
      
      // 보이스룸 타입 변경
      if (action === 'type') {
        await module.exports.handleRoomTypeChange(interaction, channel, values[0]);
        return;
      }
      
      // 권한 양도 선택
      if (action === 'transfer' && parts[2] === 'select') {
        await module.exports.handlePermissionTransferSelect(interaction, channel, values[0]);
        return;
      }
    },
    
    /**
     * 모달 제출 인터랙션 처리
     * @param {ModalSubmitInteraction} interaction - 모달 제출 인터랙션 객체
     */
    handleModalSubmitInteraction: async (interaction) => {
      const { customId, user } = interaction;
      
      // 이름 변경 모달
      if (customId.startsWith('voiceroom_rename_modal_')) {
        // 채널 ID 추출
        const channelId = customId.replace('voiceroom_rename_modal_', '');
        
        // 채널 가져오기
        const channel = interaction.client.channels.cache.get(channelId);
        
        // 채널이 존재하지 않는 경우
        if (!channel) {
          await interaction.reply({
            content: '⚠️ 해당 보이스룸이 더 이상 존재하지 않습니다.',
            ephemeral: true
          });
          return;
        }
        
        // 보이스룸 정보 가져오기
        const voiceRoomInfo = module.exports.activeVoiceRooms.get(channelId);
        
        // 정보가 없거나 소유자가 아닌 경우
        if (!voiceRoomInfo || voiceRoomInfo.ownerId !== user.id) {
          await interaction.reply({
            content: '⚠️ 이 보이스룸에 대한 권한이 없습니다.',
            ephemeral: true
          });
          return;
        }
        
        // 이름 변경 횟수 체크 (2회까지 가능)
        if (voiceRoomInfo.nameChanges >= 2) {
          await interaction.reply({
            content: '⚠️ 이름 변경은 최대 2회까지만 가능합니다.',
            ephemeral: true
          });
          return;
        }
        
        // 입력된 이름 가져오기
        const customName = interaction.fields.getTextInputValue('room_name');
        
        // 타입에 따른 이모지
        const typeInfo = {
          general: '💬',
          gaming: '🐴',
          music: '🏴',
          study: '📚',
          meeting: '🗣️',
          default: '🔊'
        };
        
        // 현재 타입
        const type = voiceRoomInfo.type || 'default';
        
        // 새 채널 이름
        const newName = `${typeInfo[type]} ${customName}`;
        
        // 채널 이름 변경
        await channel.setName(newName);
        
        // 이름 변경 횟수 증가
        voiceRoomInfo.nameChanges++;
        module.exports.activeVoiceRooms.set(channelId, voiceRoomInfo);
        
        await interaction.reply({
          content: `✅ 보이스룸 이름이 \`${newName}\`으로 변경되었습니다. (남은 변경 횟수: ${2 - voiceRoomInfo.nameChanges}회)`,
          ephemeral: true
        });
        
        console.log(`✅ 보이스룸 모듈: 보이스룸 이름이 변경되었습니다: ${channel.id} -> ${newName}`);
      }
    },
    
    /**
     * 권한 확인 처리
     * @param {ButtonInteraction} interaction - 버튼 인터랙션 객체
     * @param {VoiceChannel} channel - 음성 채널 객체
     */
    handlePermissionCheck: async (interaction, channel) => {
      // 현재 채널 멤버 목록
      const members = channel.members.map(member => 
        `${member.id === module.exports.activeVoiceRooms.get(channel.id).ownerId ? '👑' : '👤'} ${member.user.tag}`
      ).join('\n') || '없음';
      
      // 임베드 생성
      const embed = new EmbedBuilder()
        .setAuthor({ 
          name: 'DV BOT', 
          iconURL: 'https://i.imgur.com/AxeBESV.png' 
        })
        .setTitle('🔔 보이스룸 권한 확인')
        .setDescription('현재 보이스룸에 대한 권한 정보입니다.')
        .addFields(
          { name: '채널 이름', value: channel.name },
          { name: '소유자', value: `<@${module.exports.activeVoiceRooms.get(channel.id).ownerId}>` },
          { name: '현재 멤버', value: members }
        )
        .setColor('#3498DB')
        .setFooter({
          text: channel.guild.name,
          iconURL: 'https://i.imgur.com/AxeBESV.png'
        })
        .setTimestamp();
      
      await interaction.reply({
        embeds: [embed],
        ephemeral: true
      });
    },
    
    /**
     * 권한 양도 처리
     * @param {ButtonInteraction} interaction - 버튼 인터랙션 객체
     * @param {VoiceChannel} channel - 음성 채널 객체
     */
    handlePermissionTransfer: async (interaction, channel) => {
      // 채널 멤버 목록 (소유자 제외)
      const options = channel.members
        .filter(member => member.id !== interaction.user.id)
        .map(member => ({
          label: member.nickname || member.user.username,
          value: member.id,
          description: `ID: ${member.id}`
        }));
      
      // 채널에 다른 멤버가 없는 경우
      if (options.length === 0) {
        await interaction.reply({
          content: '⚠️ 권한을 양도할 다른 멤버가 없습니다.',
          ephemeral: true
        });
        return;
      }
      
      // 선택 메뉴 생성
      const row = new ActionRowBuilder()
        .addComponents(
          new StringSelectMenuBuilder()
            .setCustomId(`voiceroom_transfer_select_${channel.id}`)
            .setPlaceholder('권한을 양도할 멤버를 선택해주세요')
            .addOptions(options)
        );
      
      await interaction.reply({
        content: '👑 보이스룸 권한을 양도할 멤버를 선택해주세요:',
        components: [row],
        ephemeral: true
      });
    },
    
    /**
     * 방 타입 변경 처리
     * @param {SelectMenuInteraction} interaction - 셀렉트 메뉴 인터랙션 객체
     * @param {VoiceChannel} channel - 음성 채널 객체
     * @param {string} type - 방 타입
     */
    handleRoomTypeChange: async (interaction, channel, type) => {
      try {
        const voiceRoomInfo = module.exports.activeVoiceRooms.get(channel.id);
        
        // 정보가 없거나 소유자가 아닌 경우
        if (!voiceRoomInfo || voiceRoomInfo.ownerId !== interaction.user.id) {
          await interaction.reply({
            content: '⚠️ 이 보이스룸에 대한 권한이 없습니다.',
            ephemeral: true
          });
          return;
        }
        
        // 타입에 따른 이모지와 접미사
        const typeInfo = {
          general: { emoji: '💬', name: 'free-talk' },
          gaming: { emoji: '🐴', name: '배틀룸' },
          music: { emoji: '🏴', name: '검은발톱' },
          study: { emoji: '📚', name: '스터디룸' },
          meeting: { emoji: '🗣️', name: '회의실' }
        };
        
        // 타입 정보가 없는 경우
        if (!typeInfo[type]) {
          await interaction.reply({
            content: '⚠️ 잘못된 방 타입입니다.',
            ephemeral: true
          });
          return;
        }
        
        // 사용자 이름 (별명 우선)
        const member = channel.guild.members.cache.get(voiceRoomInfo.ownerId);
        const userName = member ? (member.nickname || member.user.username) : '알 수 없음';
        
        // 새 채널 이름
        const newName = `${typeInfo[type].emoji} ${userName}님의 ${typeInfo[type].name}`;
        
        // 채널 이름 변경
        await channel.setName(newName);
        
        // 활성 보이스룸 정보 업데이트
        voiceRoomInfo.type = type;
        module.exports.activeVoiceRooms.set(channel.id, voiceRoomInfo);
        
        await interaction.reply({
          content: `✅ 보이스룸이 \`${newName}\`으로 변경되었습니다.`,
          ephemeral: true
        });
        
        console.log(`✅ 보이스룸 모듈: 보이스룸 타입이 변경되었습니다: ${channel.id} -> ${type}`);
      } catch (error) {
        console.error('❌ 보이스룸 모듈: 방 타입 변경 중 오류 발생:', error);
        
        await interaction.reply({
          content: `⚠️ 방 타입 변경 중 오류가 발생했습니다.`,
          ephemeral: true
        }).catch(() => {});
      }
    },
    
    /**
     * 권한 양도 선택 처리
     * @param {SelectMenuInteraction} interaction - 셀렉트 메뉴 인터랙션 객체
     * @param {VoiceChannel} channel - 음성 채널 객체
     * @param {string} newOwnerId - 새 소유자 ID
     */
    handlePermissionTransferSelect: async (interaction, channel, newOwnerId) => {
      try {
        const voiceRoomInfo = module.exports.activeVoiceRooms.get(channel.id);
        
        // 정보가 없거나 소유자가 아닌 경우
        if (!voiceRoomInfo || voiceRoomInfo.ownerId !== interaction.user.id) {
          await interaction.reply({
            content: '⚠️ 이 보이스룸에 대한 권한이 없습니다.',
            ephemeral: true
          });
          return;
        }
        
        // 새 소유자 가져오기
        const newOwner = channel.guild.members.cache.get(newOwnerId);
        
        // 멤버가 없는 경우
        if (!newOwner) {
          await interaction.reply({
            content: '⚠️ 선택한 멤버를 찾을 수 없습니다.',
            ephemeral: true
          });
          return;
        }
        
        // 이전 소유자
        const oldOwner = channel.guild.members.cache.get(voiceRoomInfo.ownerId);
        
        // 권한 업데이트
        if (oldOwner) {
          // 이전 소유자 권한 제거
          await channel.permissionOverwrites.edit(oldOwner.id, {
            Connect: true,
            Speak: true,
            MuteMembers: false,
            DeafenMembers: false,
            ManageChannels: false,
            MoveMembers: false
          });
        }
        
        // 새 소유자 권한 추가
        await channel.permissionOverwrites.edit(newOwner.id, {
          Connect: true,
          Speak: true,
          MuteMembers: true,
          DeafenMembers: true,
          ManageChannels: true,
          MoveMembers: true
        });
        
        // 활성 보이스룸 정보 업데이트
        voiceRoomInfo.ownerId = newOwnerId;
        module.exports.activeVoiceRooms.set(channel.id, voiceRoomInfo);
        
        await interaction.reply({
          content: `✅ 보이스룸 권한이 <@${newOwnerId}>님에게 양도되었습니다.`,
          ephemeral: true
        });
        
        // 새 소유자에게 컨트롤 패널 전송
        module.exports.sendControlPanel(newOwner.user, channel);
        
        console.log(`✅ 보이스룸 모듈: 보이스룸 권한이 양도되었습니다: ${channel.id} -> ${newOwnerId}`);
      } catch (error) {
        console.error('❌ 보이스룸 모듈: 권한 양도 중 오류 발생:', error);
        
        await interaction.reply({
          content: `⚠️ 권한 양도 중 오류가 발생했습니다.`,
          ephemeral: true
        }).catch(() => {});
      }
    },
    
    /**
     * 이름 변경 모달 표시
     * @param {ButtonInteraction} interaction - 버튼 인터랙션 객체
     * @param {string} channelId - 채널 ID
     */
    showRenameModal: async (interaction, channelId) => {
      try {
        // 채널 가져오기
        const channel = interaction.client.channels.cache.get(channelId);
        
        // 채널이 없는 경우
        if (!channel) {
          await interaction.reply({
            content: '⚠️ 해당 보이스룸이 더 이상 존재하지 않습니다.',
            ephemeral: true
          });
          return;
        }
        
        // 보이스룸 정보 가져오기
        const voiceRoomInfo = module.exports.activeVoiceRooms.get(channelId);
        
        // 정보가 없거나 소유자가 아닌 경우
        if (!voiceRoomInfo || voiceRoomInfo.ownerId !== interaction.user.id) {
          await interaction.reply({
            content: '⚠️ 이 보이스룸에 대한 권한이 없습니다.',
            ephemeral: true
          });
          return;
        }
        
        // 이름 변경 횟수 확인
        if (voiceRoomInfo.nameChanges >= 2) {
          await interaction.reply({
            content: '⚠️ 이름 변경은 최대 2회까지만 가능합니다.',
            ephemeral: true
          });
          return;
        }
        
        // 모달 생성
        const modal = new ModalBuilder()
          .setCustomId(`voiceroom_rename_modal_${channelId}`)
          .setTitle('보이스룸 이름 변경');
        
        // 텍스트 입력 필드
        const nameInput = new TextInputBuilder()
          .setCustomId('room_name')
          .setLabel('새 이름을 입력하세요')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('예: 자유 대화방')
          .setMaxLength(25)
          .setRequired(true);
        
        // 액션 로우에 텍스트 입력 추가
        const actionRow = new ActionRowBuilder().addComponents(nameInput);
        
        // 모달에 액션 로우 추가
        modal.addComponents(actionRow);
        
        // 모달 표시
        await interaction.showModal(modal);
      } catch (error) {
        console.error('❌ 보이스룸 모듈: 이름 변경 모달 표시 중 오류 발생:', error);
        
        // 오류 발생시 사용자에게 알림
        try {
          await interaction.reply({
            content: `⚠️ 모달 표시 중 오류가 발생했습니다.`,
            ephemeral: true
          });
        } catch (replyError) {
          console.error('❌ 보이스룸 모듈: 응답 오류:', replyError);
        }
      }
    },
    
    /**
     * 보이스룸 상태 확인
     * @param {Message} message - 메시지 객체
     */
    showVoiceRoomStatus: async (message) => {
      try {
        const { guild } = message;
        
        // 활성 보이스룸 필터링 (해당 서버만)
        const serverVoiceRooms = guild.channels.cache.filter(
          ch => ch.type === ChannelType.GuildVoice && 
          module.exports.activeVoiceRooms.has(ch.id)
        );
        
        // 보이스룸이 없는 경우
        if (serverVoiceRooms.size === 0) {
          await message.reply('현재 활성화된 보이스룸이 없습니다.');
          return;
        }
        
        // 임베드 생성
        const embed = new EmbedBuilder()
          .setAuthor({ 
            name: 'DV BOT', 
            iconURL: 'https://i.imgur.com/AxeBESV.png' 
          })
          .setTitle('🔊 활성 보이스룸 현황')
          .setColor('#3498DB')
          .setDescription(`현재 ${serverVoiceRooms.size}개의 보이스룸이 활성화되어 있습니다.`)
          .setFooter({
            text: guild.name,
            iconURL: 'https://i.imgur.com/AxeBESV.png'
          })
          .setTimestamp();
        
        // 각 보이스룸 정보 추가
        serverVoiceRooms.forEach(voiceRoom => {
          const voiceRoomInfo = module.exports.activeVoiceRooms.get(voiceRoom.id);
          if (voiceRoomInfo) {
            const owner = guild.members.cache.get(voiceRoomInfo.ownerId);
            const ownerName = owner ? (owner.nickname || owner.user.username) : '알 수 없음';
            const memberCount = voiceRoom.members.size;
            
            embed.addFields({
              name: voiceRoom.name,
              value: `👑 소유자: ${ownerName}\n👥 인원: ${memberCount}명`,
              inline: true
            });
          }
        });
        
        // 이미지 추가
        embed.setImage('https://i.imgur.com/WQ1csTo.png');
        
        await message.reply({ embeds: [embed] });
      } catch (error) {
        console.error('❌ 보이스룸 모듈: 보이스룸 정보 표시 중 오류 발생:', error);
        
        // 오류 발생 시 채널에 알림
        try {
          await message.reply('⚠️ 보이스룸 정보를 표시하는 중 오류가 발생했습니다.');
        } catch (sendError) {
          console.error('❌ 보이스룸 모듈: 메시지 전송 오류:', sendError);
        }
      }
    },
    
    /**
     * 사용자 보이스룸 리셋
     * @param {string} userId - 사용자 ID
     * @param {string} guildId - 길드 ID
     * @returns {boolean} 성공 여부
     */
    resetUserVoiceRoom: async (userId, guildId, client) => {
      try {
        const guild = client.guilds.cache.get(guildId);
        
        // 길드가 없는 경우
        if (!guild) {
          console.error(`❌ 보이스룸 모듈: 길드를 찾을 수 없습니다: ${guildId}`);
          return false;
        }
        
        // 해당 사용자가 소유한 보이스룸 찾기
        const userVoiceRooms = guild.channels.cache.filter(
          ch => ch.type === ChannelType.GuildVoice && 
          module.exports.activeVoiceRooms.has(ch.id) &&
          module.exports.activeVoiceRooms.get(ch.id).ownerId === userId
        );
        
        // 보이스룸이 없는 경우
        if (userVoiceRooms.size === 0) {
          return false;
        }
        
        // 각 보이스룸 삭제
        for (const [id, room] of userVoiceRooms) {
          try {
            await room.delete();
            module.exports.activeVoiceRooms.delete(id);
            console.log(`✅ 보이스룸 모듈: 사용자 ${userId}의 보이스룸이 리셋되었습니다: ${id}`);
          } catch (deleteError) {
            console.error('❌ 보이스룸 모듈: 보이스룸 삭제 중 오류 발생:', deleteError);
          }
        }
        
        return true;
      } catch (error) {
        console.error('❌ 보이스룸 모듈: 사용자 보이스룸 리셋 중 오류 발생:', error);
        return false;
      }
    }
  };