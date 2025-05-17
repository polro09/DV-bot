const { 
  EmbedBuilder, 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle, 
  PermissionFlagsBits, 
  Events,
  AttachmentBuilder
} = require('discord.js');
require('dotenv').config();

// 영향력 데이터 저장 맵
const influenceData = new Map();

// 일/주/월간 영향력 추적을 위한 맵
const dailyInfluence = new Map();
const weeklyInfluence = new Map();
const monthlyInfluence = new Map();

// 버튼 컴포넌트 ID 상수
const INFLUENCE_BUTTON_IDS = {
  DONATE: 'influence_donate',
  RANKING: 'influence_ranking',
  DETAILS: 'influence_details',
  DOWNLOAD: 'influence_download',
  APPROVE: 'influence_approve',
  REJECT: 'influence_reject'
};

/**
 * 영향력 모듈
 */
module.exports = {
  name: 'influence-module',
  description: '영향력 기부 및 관리 모듈',
  
  // 영향력 데이터 가져오기
  getInfluenceData: () => influenceData,
  
  // 기부 대기 상태 관리
  donationPending: new Map(),
  
  /**
   * 모듈 초기화 함수
   * @param {Client} client - Discord 클라이언트 객체
   */
  init: (client) => {
    console.log('🔍 영향력 모듈: 초기화 중...');
    
    // 환경변수 유효성 검사
    const resultChannelId = process.env.INFLUENCE_RESULT_CHANNEL_ID;
    
    if (!resultChannelId) {
      console.error('❌ 영향력 모듈: 필수 환경변수가 설정되지 않았습니다. (INFLUENCE_RESULT_CHANNEL_ID)');
      return;
    }
    
    // 명령어 리스너 등록
    client.on(Events.MessageCreate, async (message) => {
      // 봇 메시지 무시
      if (message.author.bot) return;
      
      // 접두사 가져오기
      const prefix = process.env.PREFIX || '!';
      
      // 메시지가 접두사로 시작하는지 확인
      if (!message.content.startsWith(prefix)) {
        // 기부 대기 처리
        await module.exports.handlePendingDonation(client, message);
        return;
      }
      
      const args = message.content.slice(prefix.length).trim().split(/ +/);
      const command = args.shift().toLowerCase();
      
      // 영향력 명령어 처리
      if (command === '영향력') {
        console.log('✅ 영향력 명령어 인식됨');
        await module.exports.showInfluencePanel(message);
      }
    });
    
    // 인터랙션 리스너 등록
    client.on(Events.InteractionCreate, async (interaction) => {
      try {
        // 버튼 인터랙션 처리
        if (interaction.isButton() && interaction.customId.startsWith('influence_')) {
          await module.exports.handleButtonInteraction(client, interaction);
        }
      } catch (error) {
        console.error('❌ 영향력 모듈: 인터랙션 처리 중 오류 발생:', error);
        
        // 응답이 아직 전송되지 않은 경우 오류 메시지 전송
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({
            content: '⚠️ 명령어 처리 중 오류가 발생했습니다.',
            ephemeral: true
          }).catch(() => {});
        }
      }
    });
    
    // 주기적으로 일/주/월간 데이터 초기화
    setupPeriodicReset();
    
    console.log('✅ 영향력 모듈이 초기화되었습니다.');
  },
  
  /**
   * 영향력 패널 표시 함수
   * @param {Message} message - 메시지 객체
   */
  showInfluencePanel: async (message) => {
    try {
      // guild 변수 선언
      const { guild } = message;
      
      // 임베드 생성
      const embed = new EmbedBuilder()
        .setColor('#FFD700') // 블루바이올렛 색상
        .setTitle('🌟 영향력 시스템')
        .setDescription('DV 클랜의 영향력 시스템입니다.\n아래 버튼을 통해 영향력 기부, 랭킹 확인, 상세 정보를 확인할 수 있습니다.')
        .addFields(
          { name: '✨ 영향력이란?', value: 'DV 클랜의 발전과 활동에 기여하는 지표입니다.', inline: false },
          { name: '💰 기부 방법', value: '아래 기부 버튼을 클릭하여 영향력을 기부할 수 있습니다.', inline: false },
          { name: '📊 영향력 랭킹', value: '랭킹 버튼을 클릭하여 기부 순위를 확인할 수 있습니다.', inline: false }
        )
        .setAuthor({ 
          name: 'DV BOT', 
          iconURL: 'https://i.imgur.com/AxeBESV.png' 
        })
        .setThumbnail(guild.iconURL({ dynamic: true }))
        .setImage('https://i.imgur.com/WQ1csTo.png')
        .setFooter({ 
          text: guild.name, 
          iconURL: 'https://i.imgur.com/AxeBESV.png' 
        })
        .setTimestamp();
      
      // 버튼 생성
      const row = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId(INFLUENCE_BUTTON_IDS.DONATE)
            .setLabel('기부')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('💰'),
          new ButtonBuilder()
            .setCustomId(INFLUENCE_BUTTON_IDS.RANKING)
            .setLabel('랭킹')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('📊'),
          new ButtonBuilder()
            .setCustomId(INFLUENCE_BUTTON_IDS.DETAILS)
            .setLabel('상세정보')
            .setStyle(ButtonStyle.Success)
            .setEmoji('📝')
        );
      
      // 메시지 전송
      await message.channel.send({
        embeds: [embed],
        components: [row]
      });
      
      // 원본 명령어 메시지 삭제 (선택적)
      if (message.deletable) {
        await message.delete().catch(() => {});
      }
      
    } catch (error) {
      console.error('❌ 영향력 모듈: 영향력 패널 생성 중 오류 발생:', error);
      await message.reply('⚠️ 영향력 패널을 표시하는 동안 오류가 발생했습니다.');
    }
  },
  
  /**
   * 버튼 인터랙션 처리
   * @param {Client} client - Discord 클라이언트 객체
   * @param {ButtonInteraction} interaction - 버튼 인터랙션 객체
   */
  handleButtonInteraction: async (client, interaction) => {
    const { customId, user, guild } = interaction;
    
    switch (customId) {
      case INFLUENCE_BUTTON_IDS.DONATE:
        await module.exports.handleDonateButton(interaction);
        break;
        
      case INFLUENCE_BUTTON_IDS.RANKING:
        await module.exports.handleRankingButton(interaction);
        break;
        
      case INFLUENCE_BUTTON_IDS.DETAILS:
        await module.exports.handleDetailsButton(client, interaction);
        break;
        
      case INFLUENCE_BUTTON_IDS.DOWNLOAD:
        await module.exports.handleDownloadButton(client, interaction);
        break;
        
      case INFLUENCE_BUTTON_IDS.APPROVE:
        await module.exports.handleApproveButton(client, interaction);
        break;
        
      case INFLUENCE_BUTTON_IDS.REJECT:
        await module.exports.handleRejectButton(client, interaction);
        break;
    }
  },
  
  /**
   * 기부 버튼 처리
   * @param {ButtonInteraction} interaction - 버튼 인터랙션 객체
   */
  handleDonateButton: async (interaction) => {
    try {
      // 기부 임베드 생성
      const embed = new EmbedBuilder()
        .setColor('#4169E1') // 로얄 블루 색상
        .setTitle('💰 영향력 기부')
        .setDescription('아래 절차에 따라 영향력을 기부해주세요:')
        .addFields(
          { name: '1️⃣ 기부 금액 입력', value: '기부할 영향력 금액을 숫자로만 입력해주세요.', inline: false },
          { name: '2️⃣ 증빙 스크린샷 첨부', value: '영향력 기부 증빙 스크린샷을 첨부해주세요.', inline: false },
          { name: '⚠️ 주의사항', value: '- 하나의 메시지에 금액과 스크린샷을 함께 보내주세요.\n- 메시지는 자동으로 처리 후 삭제됩니다.', inline: false }
        )
        .setAuthor({ 
          name: 'DV BOT', 
          iconURL: 'https://i.imgur.com/AxeBESV.png' 
        })
        .setImage('https://i.imgur.com/WQ1csTo.png')
        .setFooter({ 
          text: interaction.guild.name, 
          iconURL: 'https://i.imgur.com/AxeBESV.png' 
        })
        .setTimestamp();
      
      // 기부 대기 상태로 등록
      module.exports.donationPending.set(interaction.user.id, {
        channelId: interaction.channelId,
        timestamp: Date.now()
      });
      
      // 임베드 전송 (ephemeral - 본인만 볼 수 있음)
      await interaction.reply({
        embeds: [embed],
        ephemeral: true
      });
      
    } catch (error) {
      console.error('❌ 영향력 모듈: 기부 버튼 처리 중 오류 발생:', error);
      
      // 오류 메시지 전송
      if (!interaction.replied) {
        await interaction.reply({
          content: '⚠️ 기부 처리 중 오류가 발생했습니다.',
          ephemeral: true
        }).catch(() => {});
      }
    }
  },
/**
   * 랭킹 버튼 처리
   * @param {ButtonInteraction} interaction - 버튼 인터랙션 객체
   */
handleRankingButton: async (interaction) => {
  try {
    const { guild } = interaction;
    
    // 영향력 데이터 정렬 (내림차순)
    const sortedData = [...influenceData.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15); // 상위 15명만
    
    // 랭킹 데이터가 없는 경우
    if (sortedData.length === 0) {
      await interaction.reply({
        content: '⚠️ 현재 기부된 영향력 데이터가 없습니다.',
        ephemeral: true
      });
      return;
    }
    
    // 1위 사용자 정보 가져오기
    const topDonorId = sortedData[0][0];
    const topDonorAmount = sortedData[0][1];
    const topDonorMember = await guild.members.fetch(topDonorId).catch(() => null);
    const topDonorName = topDonorMember ? (topDonorMember.nickname || topDonorMember.user.username) : '알 수 없음';
    const topDonorAvatar = topDonorMember ? topDonorMember.user.displayAvatarURL({ dynamic: true }) : null;
    
    // 최대 영향력 값 (게이지바 계산용)
    const maxInfluence = topDonorAmount;
    
    // 랭킹 문자열 생성
    let rankingText = '';
    for (let i = 0; i < sortedData.length; i++) {
      const [userId, amount] = sortedData[i];
      const member = await guild.members.fetch(userId).catch(() => null);
      if (!member) continue;
      
      const displayName = member.nickname || member.user.username;
      const percent = Math.round((amount / maxInfluence) * 100);
      const bar = createInfluenceBar(percent);
      
      // 순위 이모지
      let rankEmoji = `${i + 1}. `;
      if (i === 0) rankEmoji = '🥇 ';
      else if (i === 1) rankEmoji = '🥈 ';
      else if (i === 2) rankEmoji = '🥉 ';
      
      rankingText += `${rankEmoji}<@${userId}> - ${bar} **${amount}**\n`;
    }
    
    // 임베드 생성
    const embed = new EmbedBuilder()
      .setColor('#FFD700') // 골드 색상
      .setTitle(`🏆 ${topDonorName} - ${topDonorAmount}`)
      .setDescription('### 📊 영향력 기부 랭킹 TOP 15\n' + rankingText)
      .setAuthor({ 
        name: 'DV BOT', 
        iconURL: 'https://i.imgur.com/AxeBESV.png' 
      })
      .setThumbnail(topDonorAvatar)
      .setImage('https://i.imgur.com/WQ1csTo.png')
      .setFooter({ 
        text: guild.name, 
        iconURL: 'https://i.imgur.com/AxeBESV.png' 
      })
      .setTimestamp();
    
    await interaction.reply({
      embeds: [embed],
      ephemeral: true
    });
    
  } catch (error) {
    console.error('❌ 영향력 모듈: 랭킹 버튼 처리 중 오류 발생:', error);
    
    // 오류 메시지 전송
    if (!interaction.replied) {
      await interaction.reply({
        content: '⚠️ 랭킹 표시 중 오류가 발생했습니다.',
        ephemeral: true
      }).catch(() => {});
    }
  }
},

/**
 * 상세정보 버튼 처리
 * @param {Client} client - Discord 클라이언트 객체
 * @param {ButtonInteraction} interaction - 버튼 인터랙션 객체
 */
handleDetailsButton: async (client, interaction) => {
  try {
    const { guild } = interaction;
    
    // 디퍼 처리 (응답 지연)
    await interaction.deferReply({ ephemeral: true });
    
    // 총 영향력 계산
    const totalInfluence = [...influenceData.values()].reduce((sum, amount) => sum + amount, 0);
    
    // 일/주/월간 영향력 계산
    const totalDailyInfluence = [...dailyInfluence.values()].reduce((sum, amount) => sum + amount, 0);
    const totalWeeklyInfluence = [...weeklyInfluence.values()].reduce((sum, amount) => sum + amount, 0);
    const totalMonthlyInfluence = [...monthlyInfluence.values()].reduce((sum, amount) => sum + amount, 0);
    
    // 기부 참여자 수
    const contributorCount = influenceData.size;
    
    // 특정 역할을 가진 멤버 수 계산 (기부 가능한 사람) - 모든 멤버 가져오기
    const targetRoleId = '1370666632153792575';
    const members = await guild.members.fetch(); // 모든 멤버 가져오기
    const eligibleMembers = members.filter(member => member.roles.cache.has(targetRoleId));
    const eligibleCount = eligibleMembers.size;
    
    // 최고 기부자 찾기
    let topDonorId = null;
    let topDonorAmount = 0;
    
    influenceData.forEach((amount, userId) => {
      if (amount > topDonorAmount) {
        topDonorAmount = amount;
        topDonorId = userId;
      }
    });
    
    // 최고 기부자 정보
    let topDonorInfo = '없음';
    if (topDonorId) {
      const topDonorMember = await guild.members.fetch(topDonorId).catch(() => null);
      if (topDonorMember) {
        const topDonorName = topDonorMember.nickname || topDonorMember.user.username;
        topDonorInfo = `<@${topDonorId}> (${topDonorName}) - ${topDonorAmount}`;
      }
    }
    
    // 기부하지 않은 사람 목록 생성
    const nonContributors = eligibleMembers.filter(member => !influenceData.has(member.id));
    const nonContributorCount = nonContributors.size;
    
    // 임베드 생성
    const embed = new EmbedBuilder()
      .setColor('#32CD32') // 라임 그린 색상
      .setTitle('📝 영향력 시스템 상세 정보')
      .setDescription('DV 클랜의 영향력 시스템에 대한 상세 정보입니다.')
      .addFields(
        { name: '💰 총 기부된 영향력', value: `${totalInfluence}`, inline: true },
        { name: '📊 일간 기부량', value: `${totalDailyInfluence}`, inline: true },
        { name: '📈 주간 기부량', value: `${totalWeeklyInfluence}`, inline: true },
        { name: '📉 월간 기부량', value: `${totalMonthlyInfluence}`, inline: true },
        { name: '👥 기부 참여자 수', value: `${contributorCount}명`, inline: true },
        { name: '🧑‍🤝‍🧑 기부 가능한 사람', value: `${eligibleCount}명`, inline: true },
        { name: '🏆 최고 기부자', value: topDonorInfo, inline: false },
        { name: '❌ 기부하지 않은 사람', value: `${nonContributorCount}명 (아래 버튼을 클릭하여 목록 다운로드)`, inline: false }
      )
      .setAuthor({ 
        name: 'DV BOT', 
        iconURL: 'https://i.imgur.com/AxeBESV.png' 
      })
      .setThumbnail(guild.iconURL({ dynamic: true }))
      .setImage('https://i.imgur.com/WQ1csTo.png')
      .setFooter({ 
        text: guild.name, 
        iconURL: 'https://i.imgur.com/AxeBESV.png' 
      })
      .setTimestamp();
    
    // 다운로드 버튼 생성
    const row = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId(INFLUENCE_BUTTON_IDS.DOWNLOAD)
          .setLabel('기부하지 않은 사람 목록 다운로드')
          .setStyle(ButtonStyle.Danger)
          .setEmoji('📥')
      );
    
    await interaction.editReply({
      embeds: [embed],
      components: [row],
      ephemeral: true
    });
    
  } catch (error) {
    console.error('❌ 영향력 모듈: 상세정보 버튼 처리 중 오류 발생:', error);
    
    // 오류 메시지 전송
    try {
      await interaction.editReply({
        content: '⚠️ 상세정보 표시 중 오류가 발생했습니다.',
        ephemeral: true
      });
    } catch (e) {
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({
          content: '⚠️ 상세정보 표시 중 오류가 발생했습니다.',
          ephemeral: true
        }).catch(() => {});
      }
    }
  }
},

/**
 * 다운로드 버튼 처리
 * @param {Client} client - Discord 클라이언트 객체
 * @param {ButtonInteraction} interaction - 버튼 인터랙션 객체
 */
handleDownloadButton: async (client, interaction) => {
  try {
    const { guild } = interaction;
    
    // 디퍼 처리 (응답 지연)
    await interaction.deferReply({ ephemeral: true });
    
    // 특정 역할을 가진 멤버 목록 - 모든 멤버 가져오기
    const targetRoleId = '1370666632153792575';
    const members = await guild.members.fetch(); // 모든 멤버 가져오기
    const eligibleMembers = members.filter(member => member.roles.cache.has(targetRoleId));
    
    // 기부하지 않은 사람 목록
    const nonContributors = eligibleMembers.filter(member => !influenceData.has(member.id));
    
    // 목록이 비어있는 경우
    if (nonContributors.size === 0) {
      await interaction.editReply({
        content: '✅ 모든 대상자가 기부에 참여했습니다!',
        ephemeral: true
      });
      return;
    }
    
    // 텍스트 파일 내용 생성
    let fileContent = '=== 기부하지 않은 사람 목록 ===\n';
    fileContent += `생성 시간: ${new Date().toLocaleString()}\n\n`;
    
    let index = 1;
    nonContributors.forEach(member => {
      const displayName = member.nickname || member.user.username;
      fileContent += `${index}. ${displayName} (ID: ${member.id})\n`;
      index++;
    });
    
    // 파일 생성
    const attachment = new AttachmentBuilder(
      Buffer.from(fileContent, 'utf-8'),
      { name: `non_contributors_${Date.now()}.txt` }
    );
    
    // 파일 전송
    await interaction.editReply({
      content: '📥 기부하지 않은 사람 목록입니다:',
      files: [attachment],
      ephemeral: true
    });
    
  } catch (error) {
    console.error('❌ 영향력 모듈: 다운로드 버튼 처리 중 오류 발생:', error);
    
    // 오류 메시지 전송
    try {
      await interaction.editReply({
        content: '⚠️ 목록 생성 중 오류가 발생했습니다.',
        ephemeral: true
      });
    } catch (e) {
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({
          content: '⚠️ 목록 생성 중 오류가 발생했습니다.',
          ephemeral: true
        }).catch(() => {});
      }
    }
  }
},

/**
 * 승인 버튼 처리
 * @param {Client} client - Discord 클라이언트 객체
 * @param {ButtonInteraction} interaction - 버튼 인터랙션 객체
 */
handleApproveButton: async (client, interaction) => {
  try {
    // 관리자 권한 확인
    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
      const noPermEmbed = new EmbedBuilder()
        .setColor('#FF0000')
        .setTitle('⚠️ 권한 없음')
        .setDescription('영향력 기부 승인을 위해 관리자 권한이 필요합니다.')
        .setAuthor({ 
          name: 'DV BOT', 
          iconURL: 'https://i.imgur.com/AxeBESV.png' 
        })
        .setFooter({ 
          text: interaction.guild.name, 
          iconURL: 'https://i.imgur.com/AxeBESV.png' 
        })
        .setTimestamp();
        
      await interaction.reply({
        embeds: [noPermEmbed],
        ephemeral: true
      });
      return;
    }
    
    // 메시지에서 정보 추출
    const originalEmbed = interaction.message.embeds[0];
    if (!originalEmbed) return;
    
    // 기부 정보 추출
    const donorId = originalEmbed.description.match(/<@(\d+)>/)?.[1];
    if (!donorId) return;
    
    // 버튼 비활성화
    const disabledRow = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId(INFLUENCE_BUTTON_IDS.APPROVE)
          .setLabel('승인완료')
          .setStyle(ButtonStyle.Success)
          .setEmoji('✅')
          .setDisabled(true),
        new ButtonBuilder()
          .setCustomId(INFLUENCE_BUTTON_IDS.REJECT)
          .setLabel('거부')
          .setStyle(ButtonStyle.Danger)
          .setEmoji('❌')
          .setDisabled(true)
      );
    
    // 수정된 임베드 생성
    const updatedEmbed = new EmbedBuilder()
      .setColor('#00FF00') // 승인됨 (초록색)
      .setTitle('✅ 영향력 기부 승인됨')
      .setDescription(originalEmbed.description)
      .setFields(originalEmbed.fields || [])
      .setAuthor(originalEmbed.author || { 
        name: 'DV BOT', 
        iconURL: 'https://i.imgur.com/AxeBESV.png' 
      })
      .setImage(originalEmbed.image?.url || 'https://i.imgur.com/WQ1csTo.png')
      .setThumbnail(originalEmbed.thumbnail?.url || null)
      .setFooter(originalEmbed.footer || { 
        text: interaction.guild.name, 
        iconURL: 'https://i.imgur.com/AxeBESV.png' 
      })
      .setTimestamp();
    
    // 메시지 업데이트 (완전히 새로 만든 임베드 사용)
    await interaction.message.edit({
      embeds: [updatedEmbed],
      components: [disabledRow]
    });
    
    // 승인 완료 응답
    const responseEmbed = new EmbedBuilder()
      .setColor('#00FF00')
      .setTitle('✅ 영향력 기부 승인 완료')
      .setDescription(`<@${donorId}>님의 영향력 기부가 승인되었습니다.`)
      .setAuthor({ 
        name: 'DV BOT', 
        iconURL: 'https://i.imgur.com/AxeBESV.png' 
      })
      .setFooter({ 
        text: interaction.guild.name, 
        iconURL: 'https://i.imgur.com/AxeBESV.png' 
      })
      .setTimestamp();
    
    await interaction.reply({
      embeds: [responseEmbed],
      ephemeral: true
    });
    
  } catch (error) {
    console.error('❌ 영향력 모듈: 승인 버튼 처리 중 오류 발생:', error);
    
    // 오류 응답
    const errorEmbed = new EmbedBuilder()
      .setColor('#FF0000')
      .setTitle('⚠️ 오류 발생')
      .setDescription('기부 승인 중 오류가 발생했습니다.')
      .setAuthor({ 
        name: 'DV BOT', 
        iconURL: 'https://i.imgur.com/AxeBESV.png' 
      })
      .setFooter({ 
        text: interaction.guild.name, 
        iconURL: 'https://i.imgur.com/AxeBESV.png' 
      })
      .setTimestamp();
      
      if (!interaction.replied) {
        await interaction.reply({
          embeds: [errorEmbed],
          ephemeral: true
        }).catch(() => {});
      }
    }
  },
  
  /**
   * 거부 버튼 처리
   * @param {Client} client - Discord 클라이언트 객체
   * @param {ButtonInteraction} interaction - 버튼 인터랙션 객체
   */
  handleRejectButton: async (client, interaction) => {
    try {
      // 관리자 권한 확인
      if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
        const noPermEmbed = new EmbedBuilder()
          .setColor('#FF0000')
          .setTitle('⚠️ 권한 없음')
          .setDescription('영향력 기부 거부를 위해 관리자 권한이 필요합니다.')
          .setAuthor({ 
            name: 'DV BOT', 
            iconURL: 'https://i.imgur.com/AxeBESV.png' 
          })
          .setFooter({ 
            text: interaction.guild.name, 
            iconURL: 'https://i.imgur.com/AxeBESV.png' 
          })
          .setTimestamp();
          
        await interaction.reply({
          embeds: [noPermEmbed],
          ephemeral: true
        });
        return;
      }
      
      // 메시지에서 정보 추출
      const originalEmbed = interaction.message.embeds[0];
      if (!originalEmbed) return;
      
      // 기부 정보 추출
      const donorId = originalEmbed.description.match(/<@(\d+)>/)?.[1];
      const amountMatch = originalEmbed.description.match(/\*\*(\d+)\*\*/);
      const amount = amountMatch ? parseInt(amountMatch[1]) : 0;
      
      if (!donorId || !amount) return;
      
      // 영향력 데이터에서 제거
      const currentAmount = influenceData.get(donorId) || 0;
      if (currentAmount >= amount) {
        influenceData.set(donorId, currentAmount - amount);
        
        // 일/주/월간 데이터 업데이트
        const dailyAmount = dailyInfluence.get(donorId) || 0;
        const weeklyAmount = weeklyInfluence.get(donorId) || 0;
        const monthlyAmount = monthlyInfluence.get(donorId) || 0;
        
        dailyInfluence.set(donorId, Math.max(0, dailyAmount - amount));
        weeklyInfluence.set(donorId, Math.max(0, weeklyAmount - amount));
        monthlyInfluence.set(donorId, Math.max(0, monthlyAmount - amount));
      }
      
      // 버튼 비활성화
      const disabledRow = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId(INFLUENCE_BUTTON_IDS.APPROVE)
            .setLabel('승인')
            .setStyle(ButtonStyle.Success)
            .setEmoji('✅')
            .setDisabled(true),
          new ButtonBuilder()
            .setCustomId(INFLUENCE_BUTTON_IDS.REJECT)
            .setLabel('거부완료')
            .setStyle(ButtonStyle.Danger)
            .setEmoji('❌')
            .setDisabled(true)
        );
      
      // 수정된 임베드 생성
      const updatedEmbed = new EmbedBuilder()
        .setColor('#FF0000') // 거부됨 (빨간색)
        .setTitle('❌ 영향력 기부 거부됨')
        .setDescription(originalEmbed.description)
        .setFields(originalEmbed.fields || [])
        .setAuthor(originalEmbed.author || { 
          name: 'DV BOT', 
          iconURL: 'https://i.imgur.com/AxeBESV.png' 
        })
        .setImage(originalEmbed.image?.url || 'https://i.imgur.com/WQ1csTo.png')
        .setThumbnail(originalEmbed.thumbnail?.url || null)
        .setFooter(originalEmbed.footer || { 
          text: interaction.guild.name, 
          iconURL: 'https://i.imgur.com/AxeBESV.png' 
        })
        .setTimestamp();
      
      // 메시지 업데이트
      await interaction.message.edit({
        embeds: [updatedEmbed],
        components: [disabledRow]
      });
      
      // 거부 완료 응답
      const responseEmbed = new EmbedBuilder()
        .setColor('#FF0000')
        .setTitle('❌ 영향력 기부 거부 완료')
        .setDescription(`<@${donorId}>님의 영향력 기부가 거부되었습니다.`)
        .setAuthor({ 
          name: 'DV BOT', 
          iconURL: 'https://i.imgur.com/AxeBESV.png' 
        })
        .setFooter({ 
          text: interaction.guild.name, 
          iconURL: 'https://i.imgur.com/AxeBESV.png' 
        })
        .setTimestamp();
      
      await interaction.reply({
        embeds: [responseEmbed],
        ephemeral: true
      });
      
      // 사용자에게 DM으로 알림
      try {
        const member = await interaction.guild.members.fetch(donorId);
        if (member) {
          const rejectNotificationEmbed = new EmbedBuilder()
            .setColor('#FF0000')
            .setTitle('❌ 영향력 기부 거부')
            .setDescription(`${amount}의 영향력 기부가 관리자에 의해 거부되었습니다.`)
            .setAuthor({ 
              name: 'DV BOT', 
              iconURL: 'https://i.imgur.com/AxeBESV.png' 
            })
            .setFooter({ 
              text: interaction.guild.name, 
              iconURL: 'https://i.imgur.com/AxeBESV.png' 
            })
            .setTimestamp();
            
          await member.send({ embeds: [rejectNotificationEmbed] }).catch(() => {});
        }
      } catch (error) {
        console.error('❌ 영향력 모듈: 거부 알림 전송 중 오류 발생:', error);
      }
      
    } catch (error) {
      console.error('❌ 영향력 모듈: 거부 버튼 처리 중 오류 발생:', error);
      
      // 오류 응답
      const errorEmbed = new EmbedBuilder()
        .setColor('#FF0000')
        .setTitle('⚠️ 오류 발생')
        .setDescription('기부 거부 중 오류가 발생했습니다.')
        .setAuthor({ 
          name: 'DV BOT', 
          iconURL: 'https://i.imgur.com/AxeBESV.png' 
        })
        .setFooter({ 
          text: interaction.guild.name, 
          iconURL: 'https://i.imgur.com/AxeBESV.png' 
        })
        .setTimestamp();
        
      if (!interaction.replied) {
        await interaction.reply({
          embeds: [errorEmbed],
          ephemeral: true
        }).catch(() => {});
      }
    }
  },
  
  /**
   * 기부 대기 처리
   * @param {Client} client - Discord 클라이언트 객체
   * @param {Message} message - 메시지 객체
   */
  handlePendingDonation: async (client, message) => {
    try {
      const { author, content, attachments, channel } = message;
      
      // 기부 대기 중인지 확인
      const pendingDonation = module.exports.donationPending.get(author.id);
      if (!pendingDonation) return;
      
      // 기부 대기 채널과 현재 채널이 일치하는지 확인
      if (pendingDonation.channelId !== channel.id) return;
      
      // 첨부 파일 확인
      if (attachments.size === 0) return;
      
      // 숫자 추출
      const amount = extractNumber(content);
      if (!amount) return;
      
      // 30분이 지났으면 대기 상태 취소
      const currentTime = Date.now();
      if (currentTime - pendingDonation.timestamp > 30 * 60 * 1000) {
        module.exports.donationPending.delete(author.id);
        return;
      }
      
      // 기부 처리
      await processDonation(client, message, author, amount);
      
    } catch (error) {
      console.error('❌ 영향력 모듈: 기부 대기 처리 중 오류 발생:', error);
    }
  },
};

/**
 * 영향력 바 생성 함수
 * @param {number} percent - 퍼센트 (0-100)
 * @returns {string} 게이지바 문자열
 */
function createInfluenceBar(percent) {
  const filledBlocks = Math.floor(percent / 5); // 20칸 게이지바
  const emptyBlocks = 20 - filledBlocks;
  
  let bar = '';
  
  // 채워진 블록
  for (let i = 0; i < filledBlocks; i++) {
    bar += '█';
  }
  
  // 빈 블록
  // 너무 길어지지 않도록 조정 (10칸만 표시)
  if (emptyBlocks > 0 && bar.length < 10) {
    const visibleEmptyBlocks = Math.min(emptyBlocks, 10 - bar.length);
    bar += '░'.repeat(visibleEmptyBlocks);
  }
  
  return bar;
}

/**
 * 메시지에서 숫자 추출 함수
 * @param {string} content - 메시지 내용
 * @returns {number|null} 추출된 숫자 또는 null
 */
function extractNumber(content) {
  const matches = content.match(/\d+/);
  if (matches && matches.length > 0) {
    return parseInt(matches[0]);
  }
  return null;
}

/**
 * 기부 처리 함수
 * @param {Client} client - Discord 클라이언트 객체
 * @param {Message} message - 메시지 객체
 * @param {User} donor - 기부자 객체
 * @param {number} amount - 기부 금액
 */
async function processDonation(client, message, donor, amount) {
  try {
    const { guild, attachments } = message;
    
    // 첨부 파일 정보 가져오기 (첫 번째 이미지만)
    let attachment = null;
    
    for (const [id, attach] of attachments) {
      // 이미지 파일인지 확인 (여러 확장자 지원)
      const isImage = attach.contentType?.startsWith('image/') || 
                     /\.(jpg|jpeg|png|gif|webp|bmp)$/i.test(attach.name);
      
      if (isImage) {
        attachment = attach;
        break;
      }
    }
    
    // 영향력 데이터 업데이트
    const currentAmount = influenceData.get(donor.id) || 0;
    influenceData.set(donor.id, currentAmount + amount);
    
    // 일/주/월간 데이터 업데이트
    const dailyAmount = dailyInfluence.get(donor.id) || 0;
    const weeklyAmount = weeklyInfluence.get(donor.id) || 0;
    const monthlyAmount = monthlyInfluence.get(donor.id) || 0;
    
    dailyInfluence.set(donor.id, dailyAmount + amount);
    weeklyInfluence.set(donor.id, weeklyAmount + amount);
    monthlyInfluence.set(donor.id, monthlyAmount + amount);
    
    // 결과 채널 가져오기
    const resultChannelId = process.env.INFLUENCE_RESULT_CHANNEL_ID;
    const resultChannel = client.channels.cache.get(resultChannelId);
    
    if (!resultChannel) {
      console.error(`❌ 영향력 모듈: 결과 채널을 찾을 수 없습니다: ${resultChannelId}`);
      return;
    }
    
    // 멤버 정보 가져오기
    const member = await guild.members.fetch(donor.id);
    const displayName = member.nickname || donor.username;
    
    // 결과 임베드 생성
    const resultEmbed = new EmbedBuilder()
      .setColor('#FFA500') // 오렌지 색상 (대기 상태)
      .setTitle('⌛ 영향력 기부 대기 중')
      .setDescription(`<@${donor.id}>님이 **${amount}**의 영향력을 기부했습니다!`)
      .addFields(
        { name: '🧑‍🤝‍🧑 기부자', value: displayName, inline: true },
        { name: '💰 기부 금액', value: `${amount}`, inline: true },
        { name: '💎 누적 기부량', value: `${influenceData.get(donor.id)}`, inline: true },
        { name: '📅 기부 일시', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: false },
        { name: '⚠️ 관리자 승인 필요', value: '이 기부는 관리자의 승인이 필요합니다.', inline: false }
      )
      .setAuthor({ 
        name: 'DV BOT', 
        iconURL: 'https://i.imgur.com/AxeBESV.png' 
      })
      .setThumbnail(donor.displayAvatarURL({ dynamic: true }))
      .setFooter({ 
        text: guild.name, 
        iconURL: 'https://i.imgur.com/AxeBESV.png' 
      })
      .setTimestamp();
    
    // 승인/거부 버튼 생성
    const approvalRow = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId(INFLUENCE_BUTTON_IDS.APPROVE)
          .setLabel('승인')
          .setStyle(ButtonStyle.Success)
          .setEmoji('✅'),
        new ButtonBuilder()
          .setCustomId(INFLUENCE_BUTTON_IDS.REJECT)
          .setLabel('거부')
          .setStyle(ButtonStyle.Danger)
          .setEmoji('❌')
      );
    
    // 이미지가 있을 경우에만 임베드에 표시
    if (attachment) {
      // 직접 URL을 임베드 이미지로 설정
      resultEmbed.setImage(attachment.url);
    } else {
      resultEmbed.setImage('https://i.imgur.com/WQ1csTo.png');
    }
    
    // 결과 채널에 임베드 전송
    const messageOptions = {
      embeds: [resultEmbed],
      components: [approvalRow]
    };
    
    // 결과 메시지 전송
    const resultMessage = await resultChannel.send(messageOptions);
    
    // 로그 메시지 추가 (디버깅용)
    console.log(`✅ 영향력 모듈: 결과 메시지 전송 성공 (ID: ${resultMessage.id})`);
    
    // *** 중요한 변경 부분: 지연 시간 추가 ***
    console.log('⏳ 영향력 모듈: 이미지 처리를 위한 지연 시작...');
    await new Promise(resolve => setTimeout(resolve, 3000)); // 3초 대기
    console.log('⏳ 영향력 모듈: 지연 완료, 원본 메시지 삭제 진행');
    
    // 지연 후 메시지 삭제
    if (message.deletable) {
      await message.delete().catch(error => {
        console.error('❌ 영향력 모듈: 메시지 삭제 중 오류 발생:', error);
      });
    }
    
    // 기부 대기 상태 제거
    module.exports.donationPending.delete(donor.id);
    
    // 기부 완료 메시지 전송 (DM으로)
    const completeEmbed = new EmbedBuilder()
      .setColor('#00FF00')
      .setTitle('✅ 영향력 기부 완료')
      .setDescription(`**${amount}**의 영향력 기부가 성공적으로 처리되었습니다!\n\n관리자 승인 후 최종 처리됩니다.`)
      .setAuthor({ 
        name: 'DV BOT', 
        iconURL: 'https://i.imgur.com/AxeBESV.png' 
      })
      .setFooter({ 
        text: guild.name, 
        iconURL: 'https://i.imgur.com/AxeBESV.png' 
      })
      .setTimestamp();
    
    // DM으로 완료 메시지 전송
    await donor.send({ embeds: [completeEmbed] }).catch(error => {
      console.error('❌ 영향력 모듈: DM 전송 중 오류 발생:', error);
    });
    
    console.log(`✅ 영향력 모듈: ${displayName}님이 ${amount}의 영향력을 기부했습니다. (승인 대기 중)`);
    
  } catch (error) {
    console.error('❌ 영향력 모듈: 기부 처리 중 오류 발생:', error);
  }
}

/**
 * 주기적인 데이터 초기화 설정
 */
function setupPeriodicReset() {
  // 매일 자정에 일간 데이터 초기화
  setDailyReset();
  
  // 매주 월요일 자정에 주간 데이터 초기화
  setWeeklyReset();
  
  // 매월 1일 자정에 월간 데이터 초기화
  setMonthlyReset();
}

/**
 * 일간 데이터 초기화 설정
 */
function setDailyReset() {
  const now = new Date();
  const night = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() + 1, // 다음날
    0, 0, 0 // 자정
  );
  const timeToNight = night.getTime() - now.getTime();
  
  setTimeout(() => {
    dailyInfluence.clear();
    console.log('✅ 영향력 모듈: 일간 데이터가 초기화되었습니다.');
    
    // 다음 초기화 설정 (24시간 간격)
    setInterval(() => {
      dailyInfluence.clear();
      console.log('✅ 영향력 모듈: 일간 데이터가 초기화되었습니다.');
    }, 24 * 60 * 60 * 1000);
    
    // 첫 번째 초기화 후 함수 재호출
    setDailyReset();
  }, timeToNight);
}

/**
 * 주간 데이터 초기화 설정
 */
function setWeeklyReset() {
  const now = new Date();
  const daysUntilMonday = (8 - now.getDay()) % 7; // 월요일까지 남은 일수 (월요일은 1)
  const nextMonday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() + daysUntilMonday,
    0, 0, 0 // 자정
  );
  const timeToMonday = nextMonday.getTime() - now.getTime();
  
  setTimeout(() => {
    weeklyInfluence.clear();
    console.log('✅ 영향력 모듈: 주간 데이터가 초기화되었습니다.');
    
    // 다음 초기화 설정 (7일 간격)
    setInterval(() => {
      weeklyInfluence.clear();
      console.log('✅ 영향력 모듈: 주간 데이터가 초기화되었습니다.');
    }, 7 * 24 * 60 * 60 * 1000);
    
    // 첫 번째 초기화 후 함수 재호출
    setWeeklyReset();
  }, timeToMonday);
}

/**
 * 월간 데이터 초기화 설정
 */
function setMonthlyReset() {
  const now = new Date();
  const nextMonth = new Date(
    now.getFullYear(),
    now.getMonth() + 1, // 다음달
    1, // 1일
    0, 0, 0 // 자정
  );
  const timeToNextMonth = nextMonth.getTime() - now.getTime();
  
  setTimeout(() => {
    monthlyInfluence.clear();
    console.log('✅ 영향력 모듈: 월간 데이터가 초기화되었습니다.');
    
    // 첫 번째 초기화 후 함수 재호출 (한 달마다 수동으로 설정해야 함)
    setMonthlyReset();
  }, timeToNextMonth);
}