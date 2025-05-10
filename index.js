const { Client, GatewayIntentBits, Collection, Partials } = require('discord.js');
require('dotenv').config();

// 필요한 인텐트와 Partials 설정
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ],
  partials: [Partials.GuildMember] // 부분 멤버 객체 지원 추가
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

// 모듈 로드
loadModules();

// 봇 로그인
client.login(process.env.DISCORD_TOKEN)
  .then(() => console.log('✅ 봇 로그인 성공'))
  .catch(error => console.error('❌ 봇 로그인 실패:', error.message));