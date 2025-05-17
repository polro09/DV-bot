const { Client, GatewayIntentBits, Collection, Partials } = require('discord.js');
require('dotenv').config();

// 필요한 인텐트와 Partials 설정 
// MessageContent 인텐트 추가 (명령어 인식에 필요)
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates // 보이스룸 기능에 필요한 인텐트 추가
  ],
  partials: [Partials.GuildMember, Partials.Channel, Partials.Message] // 부분 객체 지원 추가
});

// 모듈 컬렉션 생성
client.modules = new Collection();

// 모듈 로드 함수
function loadModules() {
  try {
    // 입장/퇴장 모듈 로드
    const welcomeModule = require('./modules/welcome-module.js');
    client.modules.set(welcomeModule.name, welcomeModule);
    console.log(`✅ 모듈 로드 성공: ${welcomeModule.name}`);
    
    // 투표 모듈 로드
    const voteModule = require('./modules/vote-module.js');
    client.modules.set(voteModule.name, voteModule);
    console.log(`✅ 모듈 로드 성공: ${voteModule.name}`);
    
    // 보이스룸 모듈 로드
    const voiceRoomModule = require('./modules/voice-room-module.js');
    client.modules.set(voiceRoomModule.name, voiceRoomModule);
    console.log(`✅ 모듈 로드 성공: ${voiceRoomModule.name}`);
    
    // 영향력 모듈 로드 -
    const influenceModule = require('./modules/influence-module.js');
    client.modules.set(influenceModule.name, influenceModule);
    console.log(`✅ 모듈 로드 성공: ${influenceModule.name}`);
  } catch (error) {
    console.error('❌ 모듈 로드 실패:', error.message);
  }
}

// 오류 핸들링
process.on('unhandledRejection', error => {
  console.error('❌ 처리되지 않은 Promise 거부:', error);
});

// 클라이언트 준비 이벤트
client.once('ready', () => {
  console.log(`✅ ${client.user.tag}으로 로그인했습니다!`);
  
  // 모듈 초기화
  client.modules.forEach(module => {
    if (module.init) {
      try {
        module.init(client);
        console.log(`✅ 모듈 초기화 성공: ${module.name}`);
      } catch (error) {
        console.error(`❌ 모듈 초기화 실패: ${module.name}`, error);
      }
    }
  });
});

// 디버깅을 위한 이벤트 리스너 추가
client.on('guildMemberAdd', member => {
  console.log(`🔍 디버그: 멤버 입장 이벤트 발생 - ${member.user.tag}`);
});

client.on('guildMemberRemove', member => {
  console.log(`🔍 디버그: 멤버 퇴장 이벤트 발생 - ${member.user.tag}`);
});

// 메시지 디버깅 리스너 추가
client.on('messageCreate', message => {
  // 봇 메시지는 무시
  if (message.author.bot) return;
  
  // 접두사 가져오기
  const prefix = process.env.PREFIX || '!';
  
  // 메시지가 접두사로 시작하면 로그 출력
  if (message.content.startsWith(prefix)) {
    console.log(`📝 메시지 감지 (${message.guild.name} / #${message.channel.name}): ${message.content}`);
    
    // 보이스룸 상태 확인 명령어 - 보이스룸 모듈 관련 기능
    if (message.content === `${prefix}보이스룸상태`) {
      const voiceRoomModule = client.modules.get('voice-room-module');
      if (voiceRoomModule) {
        voiceRoomModule.showVoiceRoomStatus(message);
      } else {
        message.reply('⚠️ 보이스룸 모듈이 로드되지 않았습니다.');
      }
    }
    
    // 영향력 기부 도움말 명령어 - 영향력 기부 모듈 관련 기능
    else if (message.content === `${prefix}전체도움말` || message.content === `${prefix}help`) {
      showAllHelp(message);
    }
  }
});

/**
 * 전체 도움말 표시 함수
 * @param {Message} message - 메시지 객체
 */
async function showAllHelp(message) {
  try {
    const { EmbedBuilder } = require('discord.js');
    
    // 임베드 생성
    const embed = new EmbedBuilder()
      .setAuthor({ 
        name: 'DV BOT', 
        iconURL: 'https://i.imgur.com/AxeBESV.png' 
      })
      .setTitle('📚 DV BOT 도움말')
      .setDescription('사용 가능한 모든 명령어 목록입니다.')
      .addFields(
        { 
          name: '📋 일반 명령어', 
          value: 
            '`!전체도움말` - 이 도움말 메시지 표시\n' +
            '`!help` - 위와 동일한 명령어'
        },
        { 
          name: '🎁 영향력 기부 시스템', 
          value: 
            '`!영향력기부` - 영향력 기부 인터페이스 표시\n' +
            '`!영향력순위` - 전체 영향력 기부 순위 표시\n' +
            '`!내영향력` - 자신의 영향력 기부 내역 확인\n' +
            '`!유저영향력 @유저` - 특정 유저의 영향력 기부 내역 확인\n' +
            '`!영향력도움말` - 영향력 기부 시스템 도움말'
        },
        { 
          name: '🗳️ 투표 시스템', 
          value: 
            '`!투표시작 "투표 제목" [기간]` - 새 투표 생성\n' +
            '`!투표종료 [투표ID]` - 투표 수동 종료\n' +
            '`!투표상태` - 활성화된 투표 확인\n' + 
            '`!투표도움말` - 투표 시스템 도움말'
        },
        { 
          name: '🔊 보이스룸 시스템', 
          value: 
            '`음성 로비 입장` - 자동으로 개인 보이스룸 생성\n' +
            '`!보이스룸상태` - 현재 활성화된 보이스룸 확인'
        }
      )
      .setColor('#9B59B6')
      .setThumbnail(message.guild.iconURL({ dynamic: true }))
      .setImage('https://i.imgur.com/WQ1csTo.png')
      .setFooter({ 
        text: message.guild.name, 
        iconURL: 'https://i.imgur.com/AxeBESV.png' 
      })
      .setTimestamp();
    
    // 메시지 전송
    await message.channel.send({ embeds: [embed] });
  } catch (error) {
    console.error('❌ 도움말 표시 중 오류 발생:', error);
    message.reply('⚠️ 도움말을 표시하는 중 오류가 발생했습니다.').catch(() => {});
  }
}

// 모듈 로드
loadModules();

// 봇 로그인
client.login(process.env.DISCORD_TOKEN)
  .then(() => console.log('✅ 봇 로그인 성공'))
  .catch(error => console.error('❌ 봇 로그인 실패:', error.message));