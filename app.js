// Конфигурация для онлайн работы
const API_URL = "https://anonymous-chat-mvgx.onrender.com";
const SOCKET_URL = "https://anonymous-chat-mvgx.onrender.com";

// Глобальные переменные
let allChats = [];
let userStats = {
    createdChats: 0,
    sentMessages: 0,
    gamesPlayed: 0,
    friends: 0,
    daysActive: 1,
    level: 1,
    xp: 0,
    achievements: []
};
let isVK = false;
let currentTheme = 'Общение';
let typingTimer = null;
let onlineUsers = new Set();
let lastChatParams = null;
let shownModals = new Set();
let waitingChatId = null;
let currentGame = null;

// ===== СИСТЕМА ИГР =====
const games = {
    truthOrDare: {
        name: "Правда или Действие",
        questions: [
            "Какая твоя самая большая мечта?",
            "Что бы ты сделал, если бы стал невидимкой на один день?",
            "Какой самый неловкий момент был в твоей жизни?",
            "Что ты больше всего ценишь в друзьях?",
            "Какое твое самое большое достижение?",
            "Что бы ты изменил в своем прошлом?",
            "Какой самый безумный поступок ты совершил?",
            "О чем ты чаще всего мечтаешь?",
            "Что тебя больше всего пугает в будущем?",
            "Какой совет ты бы дал себе 10-летнему?"
        ],
        dares: [
            "Спой куплет из любимой песни",
            "Сделай 10 приседаний",
            "Покажи свою самую смешную гримасу",
            "Расскажи короткое стихотворение",
            "Сымитируй звук животного",
            "Сделай комплимент собеседнику",
            "Опиши свой день жестами без слов",
            "Сделай вид, что ты супергерой",
            "Расскажи анекдот",
            "Покажи танец сидя на месте"
        ]
    },
    
    quiz: {
        name: "Викторина",
        questions: [
            {
                question: "Сколько планет в Солнечной системе?",
                options: ["7", "8", "9", "10"],
                correct: 1
            },
            {
                question: "Какая самая длинная река в мире?",
                options: ["Амазонка", "Нил", "Янцзы", "Миссисипи"],
                correct: 0
            },
            {
                question: "Кто написал 'Войну и мир'?",
                options: ["Достоевский", "Толстой", "Чехов", "Гоголь"],
                correct: 1
            },
            {
                question: "Какой химический элемент обозначается как Au?",
                options: ["Серебро", "Золото", "Алюминий", "Аргон"],
                correct: 1
            },
            {
                question: "Сколько часов в сутках?",
                options: ["12", "24", "36", "48"],
                correct: 1
            }
        ]
    },
    
    guessWord: {
        name: "Угадай слово",
        words: [
            "компьютер", "телефон", "книга", "солнце", "море",
            "горы", "музыка", "фильм", "спорт", "еда",
            "дружба", "любовь", "работа", "отпуск", "мечта",
            "путешествие", "животное", "растение", "город", "страна"
        ]
    },
    
    guessEmotion: {
        name: "Угадай эмоцию",
        emotions: [
            "радость", "грусть", "злость", "удивление", "страх",
            "отвращение", "любовь", "гордость", "стыд", "волнение",
            "спокойствие", "нетерпение", "восхищение", "разочарование", "благодарность"
        ]
    }
};

// ===== СИСТЕМА ТЕМ =====
let currentAppTheme = 'system';

function initThemeSystem() {
    const savedTheme = localStorage.getItem('app_theme');
    if (savedTheme) {
        currentAppTheme = savedTheme;
    }
    applyTheme(currentAppTheme);
    updateThemeText();
}

function applyTheme(theme) {
    currentAppTheme = theme;
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('app_theme', theme);
    updateThemeText();
}

function updateThemeText() {
    const themeText = document.getElementById('currentThemeText');
    if (themeText) {
        const themeNames = {
            'system': 'Системная',
            'light': 'Светлая',
            'dark': 'Темная'
        };
        themeText.textContent = themeNames[currentAppTheme] || 'Системная';
    }
}

function openThemeSettings() {
    const modal = document.getElementById('themeModal');
    if (modal) {
        modal.style.display = 'block';
        updateThemeSelection();
    }
}

function closeThemeModal() {
    const modal = document.getElementById('themeModal');
    if (modal) {
        modal.style.display = 'none';
    }
}

function selectTheme(theme) {
    applyTheme(theme);
    updateThemeSelection();
    showNotification(`✅ Тема изменена на "${getThemeName(theme)}"`);
}

function getThemeName(theme) {
    const names = {
        'system': 'Системная',
        'light': 'Светлая',
        'dark': 'Темная'
    };
    return names[theme] || theme;
}

function updateThemeSelection() {
    document.querySelectorAll('.theme-option').forEach(option => {
        option.classList.remove('active');
    });
    
    document.querySelectorAll('.theme-check').forEach(check => {
        check.style.opacity = '0';
    });
    
    const selectedOption = document.querySelector(`.theme-option[data-theme="${currentAppTheme}"]`);
    if (selectedOption) {
        selectedOption.classList.add('active');
        const check = selectedOption.querySelector('.theme-check');
        if (check) {
            check.style.opacity = '1';
        }
    }
}

// ===== СИСТЕМА ИГР =====
function openGamesMenu() {
    const gamesMenu = document.getElementById('gamesMenu');
    if (gamesMenu) {
        gamesMenu.classList.add('active');
    }
}

function closeGamesMenu() {
    const gamesMenu = document.getElementById('gamesMenu');
    if (gamesMenu) {
        gamesMenu.classList.remove('active');
    }
}

function startGame(gameType) {
    if (!window.currentChat || onlineUsers.size < 2) {
        showNotification('❌ Нужно дождаться подключения собеседника');
        closeGamesMenu();
        return;
    }

    closeGamesMenu();
    currentGame = {
        type: gameType,
        state: 'waiting',
        players: {},
        currentPlayer: window.vkUser?.id || 'anonymous'
    };

    switch (gameType) {
        case 'truthOrDare':
            startTruthOrDare();
            break;
        case 'quiz':
            startQuiz();
            break;
        case 'guessWord':
            startGuessWord();
            break;
        case 'guessEmotion':
            startGuessEmotion();
            break;
    }
}

function startTruthOrDare() {
    const game = games.truthOrDare;
    const isTruth = Math.random() > 0.5;
    const items = isTruth ? game.questions : game.dares;
    const randomItem = items[Math.floor(Math.random() * items.length)];
    
    const gameMessage = `
        <div class="game-question">🎲 Правда или Действие</div>
        <div>${isTruth ? '📖 Правда:' : '🎯 Действие:'} ${randomItem}</div>
        <div class="game-stats">
            <span>Игрок 1: ❓</span>
            <span>Игрок 2: ❓</span>
        </div>
    `;
    
    sendGameMessage(gameMessage);
    currentGame.question = randomItem;
    currentGame.isTruth = isTruth;
    currentGame.state = 'playing';
    
    if (window.socket) {
        window.socket.emit('game_started', {
            chatId: window.currentChat.id,
            gameType: 'truthOrDare',
            question: randomItem,
            isTruth: isTruth
        });
    }
}

function startQuiz() {
    const game = games.quiz;
    const randomQuestion = game.questions[Math.floor(Math.random() * game.questions.length)];
    
    let optionsHTML = '';
    randomQuestion.options.forEach((option, index) => {
        optionsHTML += `<div class="game-option" onclick="answerQuiz(${index})">${option}</div>`;
    });
    
    const gameMessage = `
        <div class="game-question">❓ Викторина</div>
        <div>${randomQuestion.question}</div>
        <div class="game-options">${optionsHTML}</div>
        <div class="game-stats">
            <span>Игрок 1: ❓</span>
            <span>Игрок 2: ❓</span>
        </div>
    `;
    
    sendGameMessage(gameMessage);
    currentGame.question = randomQuestion;
    currentGame.answers = {};
    currentGame.state = 'playing';
    
    if (window.socket) {
        window.socket.emit('game_started', {
            chatId: window.currentChat.id,
            gameType: 'quiz',
            question: randomQuestion
        });
    }
}

function answerQuiz(answerIndex) {
    if (!currentGame || currentGame.type !== 'quiz') return;
    
    const isCorrect = answerIndex === currentGame.question.correct;
    const playerId = window.vkUser?.id || 'anonymous';
    
    currentGame.answers[playerId] = {
        answer: answerIndex,
        correct: isCorrect
    };
    
    updateGameMessage();
    
    const allPlayersAnswered = Object.keys(currentGame.answers).length === 2;
    
    if (allPlayersAnswered) {
        endQuizGame();
    }
    
    if (window.socket) {
        window.socket.emit('game_answer', {
            chatId: window.currentChat.id,
            gameType: 'quiz',
            playerId: playerId,
            answer: answerIndex,
            correct: isCorrect
        });
    }
}

function updateGameMessage() {
    const messages = document.querySelectorAll('.game-message');
    if (messages.length > 0) {
        const lastGameMessage = messages[messages.length - 1];
        // Обновление содержимого сообщения игры
    }
}

function endQuizGame() {
    const player1 = Object.keys(currentGame.answers)[0];
    const player2 = Object.keys(currentGame.answers)[1];
    const player1Correct = currentGame.answers[player1].correct;
    const player2Correct = currentGame.answers[player2].correct;
    
    let resultMessage = "🎉 Результаты викторины:\n";
    resultMessage += `Игрок 1: ${player1Correct ? '✅ Правильно' : '❌ Неправильно'}\n`;
    resultMessage += `Игрок 2: ${player2Correct ? '✅ Правильно' : '❌ Неправильно'}`;
    
    sendGameMessage(resultMessage);
    currentGame = null;
    
    addXP(10);
    userStats.gamesPlayed++;
    saveUserStats();
    updateProfileStats();
}

function startGuessWord() {
    const game = games.guessWord;
    const randomWord = game.words[Math.floor(Math.random() * game.words.length)];
    const hiddenWord = '*'.repeat(randomWord.length);
    
    const gameMessage = `
        <div class="game-question">🎯 Угадай слово</div>
        <div>Слово: ${hiddenWord}</div>
        <div>Подсказка: ${getWordHint(randomWord)}</div>
        <div class="game-stats">
            <span>Букв: ${randomWord.length}</span>
            <span>Попытки: 3</span>
        </div>
    `;
    
    sendGameMessage(gameMessage);
    currentGame.word = randomWord;
    currentGame.hidden = hiddenWord;
    currentGame.attempts = 3;
    currentGame.state = 'playing';
    
    if (window.socket) {
        window.socket.emit('game_started', {
            chatId: window.currentChat.id,
            gameType: 'guessWord',
            word: randomWord,
            hint: getWordHint(randomWord)
        });
    }
}

function getWordHint(word) {
    const hints = {
        'компьютер': 'Электронное устройство для работы с информацией',
        'телефон': 'Устройство для связи на расстоянии',
        'книга': 'Источник знаний с бумажными страницами',
        'солнце': 'Звезда, дающая свет и тепло',
        'море': 'Большой водоем с соленой водой',
        'горы': 'Высокие возвышенности на поверхности Земли',
        'музыка': 'Искусство звуков и мелодий',
        'фильм': 'Движущиеся картинки на экране',
        'спорт': 'Физическая активность для здоровья',
        'еда': 'То, что мы едим для питания'
    };
    return hints[word] || 'Популярное слово';
}

function handleGuessWordAttempt(guess) {
    if (!currentGame || currentGame.type !== 'guessWord') return;
    
    const normalizedGuess = guess.toLowerCase().trim();
    const normalizedWord = currentGame.word.toLowerCase();
    
    if (normalizedGuess === normalizedWord) {
        sendGameMessage(`🎉 Правильно! Слово было: "${currentGame.word}"`);
        addXP(15);
        userStats.gamesPlayed++;
        saveUserStats();
        updateProfileStats();
        currentGame = null;
    } else {
        currentGame.attempts--;
        if (currentGame.attempts > 0) {
            sendGameMessage(`❌ Неправильно! Осталось попыток: ${currentGame.attempts}`);
        } else {
            sendGameMessage(`💀 Игра окончена! Слово было: "${currentGame.word}"`);
            currentGame = null;
        }
    }
}

function startGuessEmotion() {
    const game = games.guessEmotion;
    const randomEmotion = game.emotions[Math.floor(Math.random() * game.emotions.length)];
    
    const gameMessage = `
        <div class="game-question">😊 Угадай эмоцию</div>
        <div>Игрок 1 показывает эмоцию...</div>
        <div>Игрок 2 угадывает</div>
        <div class="game-stats">
            <span>Время: 60 сек</span>
        </div>
    `;
    
    sendGameMessage(gameMessage);
    currentGame.emotion = randomEmotion;
    currentGame.state = 'showing';
    currentGame.showingPlayer = window.vkUser?.id || 'anonymous';
    
    if (window.socket) {
        window.socket.emit('game_started', {
            chatId: window.currentChat.id,
            gameType: 'guessEmotion',
            emotion: randomEmotion,
            showingPlayer: currentGame.showingPlayer
        });
    }
}

function handleGuessEmotionAttempt(guess) {
    if (!currentGame || currentGame.type !== 'guessEmotion') return;
    
    const normalizedGuess = guess.toLowerCase().trim();
    const normalizedEmotion = currentGame.emotion.toLowerCase();
    
    if (normalizedGuess === normalizedEmotion) {
        sendGameMessage(`🎉 Правильно! Эмоция была: "${currentGame.emotion}"`);
        addXP(12);
        userStats.gamesPlayed++;
        saveUserStats();
        updateProfileStats();
        currentGame = null;
    } else {
        sendGameMessage(`❌ Неправильно! Попробуйте еще раз`);
    }
}

function sendGameMessage(content) {
    const container = document.getElementById('messagesContainer');
    if (!container) return;
    
    const messageElement = document.createElement('div');
    messageElement.className = 'message game-message';
    messageElement.innerHTML = content;
    
    if (container.innerHTML.includes('Пока нет сообщений') || container.innerHTML.includes('Загружаем чат')) {
        container.innerHTML = '';
    }
    
    container.appendChild(messageElement);
    container.scrollTop = container.scrollHeight;
}

function addXP(amount) {
    userStats.xp += amount;
    if (userStats.xp >= 100) {
        userStats.level++;
        userStats.xp = userStats.xp - 100;
        showNotification(`🎉 Поздравляем! Вы достигли ${userStats.level} уровня!`);
        checkAchievements();
    }
    saveUserStats();
    updateProfileStats();
}

function checkAchievements() {
    const achievements = [
        { id: 'first_game', name: '🎮 Первая игра', description: 'Сыграйте в первую игру', condition: () => userStats.gamesPlayed >= 1 },
        { id: 'chat_master', name: '💬 Мастер общения', description: 'Создайте 5 чатов', condition: () => userStats.createdChats >= 5 },
        { id: 'game_lover', name: '🎯 Любитель игр', description: 'Сыграйте 10 игр', condition: () => userStats.gamesPlayed >= 10 },
        { id: 'level_5', name: '⭐ 5 уровень', description: 'Достигните 5 уровня', condition: () => userStats.level >= 5 }
    ];
    
    achievements.forEach(achievement => {
        if (achievement.condition() && !userStats.achievements.includes(achievement.id)) {
            userStats.achievements.push(achievement.id);
            showNotification(`🏆 Получено достижение: ${achievement.name}`);
        }
    });
    
    updateAchievementsDisplay();
}

function updateAchievementsDisplay() {
    const container = document.getElementById('achievementsContainer');
    if (!container) return;
    
    const achievements = [
        { id: 'first_game', name: '🎮 Первая игра', description: 'Сыграйте в первую игру', icon: '🎮' },
        { id: 'chat_master', name: '💬 Мастер общения', description: 'Создайте 5 чатов', icon: '💬' },
        { id: 'game_lover', name: '🎯 Любитель игр', description: 'Сыграйте 10 игр', icon: '🎯' },
        { id: 'level_5', name: '⭐ 5 уровень', description: 'Достигните 5 уровня', icon: '⭐' }
    ];
    
    container.innerHTML = '';
    
    achievements.forEach(achievement => {
        const hasAchievement = userStats.achievements.includes(achievement.id);
        const achievementElement = document.createElement('div');
        achievementElement.className = `achievement-card ${hasAchievement ? '' : 'locked'}`;
        achievementElement.innerHTML = `
            <div class="achievement-icon">${achievement.icon}</div>
            <div class="achievement-name">${achievement.name}</div>
            <div class="achievement-description">${achievement.description}</div>
        `;
        container.appendChild(achievementElement);
    });
}

// ===== ОСНОВНОЙ ФУНКЦИОНАЛ =====
async function initApp() {
    console.log('🚀 Инициализация приложения с играми...');
    
    try {
        if (typeof vkBridge !== 'undefined') {
            await vkBridge.send('VKWebAppInit');
            isVK = true;
            const userInfo = await vkBridge.send('VKWebAppGetUserInfo');
            window.vkUser = userInfo;
            updateUserInterface(userInfo);
            showNotification('Добро пожаловать, ' + userInfo.first_name + '! 🎮');
        } else {
            throw new Error('VK Bridge not available');
        }
    } catch (error) {
        console.log('Приложение запущено вне VK:', error.message);
        isVK = false;
        window.vkUser = { 
            id: 'user_' + Math.random().toString(36).substr(2, 9),
            first_name: 'Аноним',
            last_name: ''
        };
        updateUserInterface(window.vkUser);
        showNotification('Анонимный режим - можно создавать чаты и играть! 🎮');
    }

    initThemeSystem();
    await loadSocketIO();
    initSocketConnection();
    
    await loadAndRenderChats();
    loadUserStats();
    updateProfileStats();
    updateAchievementsDisplay();
    setupEventListeners();
    
    console.log('✅ Приложение с играми инициализировано');
}

function updateUserInterface(userInfo) {
    const profileNameElement = document.getElementById('profileName');
    const currentAvatarElement = document.getElementById('currentAvatar');
    
    if (profileNameElement) {
        profileNameElement.textContent = userInfo.first_name + (userInfo.last_name ? ' ' + userInfo.last_name : '');
    }
    
    if (currentAvatarElement) {
        currentAvatarElement.textContent = userInfo.first_name.charAt(0);
    }
}

function switchChatTab(theme, element) {
    console.log('🔄 Переключение на вкладку:', theme);
    
    currentTheme = theme;
    
    document.querySelectorAll('.chat-tab').forEach(tab => tab.classList.remove('active'));
    element.classList.add('active');
    
    const createChatText = document.getElementById('createChatText');
    if (createChatText) {
        createChatText.textContent = 'Создать чат для ' + theme;
    }
    
    renderChatsList();
}

function addChatToList(chat) {
    console.log('➕ Добавляем чат в список:', chat);
    
    const newChat = {
        id: chat.id,
        gender: chat.user_gender + ', ' + chat.user_age,
        lookingFor: chat.partner_gender + ', ' + chat.min_age + '-' + chat.max_age,
        theme: chat.theme,
        participants_count: chat.participants_count || 1,
        timestamp: new Date(chat.created_at).getTime(),
        userId: chat.user_id
    };
    
    allChats = allChats.filter(c => c.id !== newChat.id);
    allChats.unshift(newChat);
    
    if (newChat.theme === currentTheme) {
        renderChatsList();
    }
}

function removeChatFromList(chatId) {
    allChats = allChats.filter(chat => chat.id !== chatId);
    renderChatsList();
}

function updateOnlineCount() {
    const count = onlineUsers.size;
    const onlineCountElement = document.getElementById('onlineCount');
    if (onlineCountElement) {
        if (count === 1) {
            onlineCountElement.textContent = '1 участник • Ожидаем собеседника';
            onlineCountElement.style.color = 'var(--warning)';
        } else if (count === 2) {
            onlineCountElement.textContent = '2 участника • Можно играть! 🎮';
            onlineCountElement.style.color = 'var(--success)';
        } else {
            onlineCountElement.textContent = count + ' онлайн';
            onlineCountElement.style.color = 'var(--text-secondary)';
        }
    }
}

async function loadSocketIO() {
    return new Promise((resolve) => {
        if (typeof io !== 'undefined') {
            resolve();
            return;
        }

        const script = document.createElement('script');
        script.src = 'https://cdn.socket.io/4.7.5/socket.io.min.js';
        script.onload = () => resolve();
        script.onerror = () => resolve();
        document.head.appendChild(script);
    });
}

function initSocketConnection() {
    try {
        if (typeof io === 'undefined') {
            console.error('❌ Socket.io не доступен');
            return;
        }

        console.log('🔌 Инициализация Socket.io подключения...');
        window.socket = io(SOCKET_URL, {
            transports: ['websocket', 'polling'],
            timeout: 10000
        });
        
        window.socket.on('connect', () => {
            console.log('✅ Подключен к серверу чатов');
            if (window.vkUser?.id) {
                window.socket.emit('set_user_id', window.vkUser.id);
            }
        });
        
        window.socket.on('disconnect', (reason) => {
            console.log('❌ Отключен от сервера:', reason);
        });
        
        setupSocketHandlers();
        
    } catch (error) {
        console.error('❌ Ошибка инициализации Socket.io:', error);
    }
}

function setupSocketHandlers() {
    if (!window.socket) return;

    window.socket.on('game_started', (data) => {
        if (window.currentChat && data.chatId === window.currentChat.id) {
            handleIncomingGame(data);
        }
    });
    
    window.socket.on('game_answer', (data) => {
        if (window.currentChat && data.chatId === window.currentChat.id && currentGame) {
            handleGameAnswer(data);
        }
    });

    window.socket.on('chat_messages', (data) => {
        if (window.currentChat && data.chatId === window.currentChat.id) {
            renderMessages(data.messages);
        }
    });
    
    window.socket.on('new_chat_created', (chat) => {
        const isMyChat = chat.user_id === window.vkUser?.id;
        const existingChatIndex = allChats.findIndex(c => c.id === chat.id);
        
        if (existingChatIndex === -1) {
            addChatToList(chat);
            
            if (!isMyChat) {
                showNotification('📢 Создан новый чат в разделе "' + chat.theme + '"');
            }
        }
    });
    
    window.socket.on('chat_activated', (data) => {
        removeChatFromList(data.chatId);
        
        if (window.currentChat && data.chatId === window.currentChat.id) {
            showNotification(data.message || '💬 Найден собеседник! Можно играть! 🎮');
            onlineUsers = new Set([window.vkUser?.id, 'partner']);
            updateOnlineCount();
        }
        
        if (waitingChatId === data.chatId) {
            showScreen('chatRoomScreen');
            waitingChatId = null;
        }
    });
    
    window.socket.on('chat_removed', (data) => {
        removeChatFromList(data.chatId);
        
        if (waitingChatId === data.chatId) {
            showNotification('❌ Чат был удален до нахождения собеседника');
            showScreen('chatsScreen');
            waitingChatId = null;
        }
    });
    
    window.socket.on('user_joined', (data) => {
        if (window.currentChat && data.chatId === window.currentChat.id) {
            onlineUsers.add(data.userId);
            updateOnlineCount();
            showNotification('👤 Собеседник присоединился к чату');
        }
    });
    
    window.socket.on('user_left', (data) => {
        if (window.currentChat && data.chatId === window.currentChat.id) {
            onlineUsers.delete(data.userId);
            updateOnlineCount();
            
            const isCreator = window.currentChat.userId === window.vkUser?.id;
            const isSelfLeave = data.userId === window.vkUser?.id;
            
            if (!isSelfLeave && isCreator) {
                showPartnerLeftModal(data.chatId);
            }
        }
    });
    
    window.socket.on('new_message', (message) => {
        if (window.currentChat && message.chat_id === window.currentChat.id) {
            addMessageToChat(message);
        }
    });
    
    window.socket.on('typing_start', (data) => {
        if (window.currentChat && data.chatId === window.currentChat.id) {
            const typingIndicator = document.getElementById('typingIndicator');
            if (typingIndicator) {
                typingIndicator.style.display = 'inline';
            }
        }
    });
    
    window.socket.on('typing_stop', (data) => {
        if (window.currentChat && data.chatId === window.currentChat.id) {
            const typingIndicator = document.getElementById('typingIndicator');
            if (typingIndicator) {
                typingIndicator.style.display = 'none';
            }
        }
    });
    
    window.socket.on('online_users', (data) => {
        if (window.currentChat && data.chatId === window.currentChat.id) {
            onlineUsers = new Set(data.users);
            updateOnlineCount();
        }
    });
    
    window.socket.on('error', (data) => {
        showNotification('❌ ' + data.message);
    });
}

function handleIncomingGame(data) {
    currentGame = {
        type: data.gameType,
        state: 'playing',
        players: {}
    };
    
    switch (data.gameType) {
        case 'truthOrDare':
            currentGame.question = data.question;
            currentGame.isTruth = data.isTruth;
            const gameMessage1 = `
                <div class="game-question">🎲 Правда или Действие</div>
                <div>${data.isTruth ? '📖 Правда:' : '🎯 Действие:'} ${data.question}</div>
                <div class="game-stats">
                    <span>Игрок 1: ❓</span>
                    <span>Игрок 2: ❓</span>
                </div>
            `;
            sendGameMessage(gameMessage1);
            break;
            
        case 'quiz':
            currentGame.question = data.question;
            currentGame.answers = {};
            let optionsHTML = '';
            data.question.options.forEach((option, index) => {
                optionsHTML += `<div class="game-option" onclick="answerQuiz(${index})">${option}</div>`;
            });
            const gameMessage2 = `
                <div class="game-question">❓ Викторина</div>
                <div>${data.question.question}</div>
                <div class="game-options">${optionsHTML}</div>
                <div class="game-stats">
                    <span>Игрок 1: ❓</span>
                    <span>Игрок 2: ❓</span>
                </div>
            `;
            sendGameMessage(gameMessage2);
            break;
            
        case 'guessWord':
            currentGame.word = data.word;
            currentGame.hidden = '*'.repeat(data.word.length);
            currentGame.attempts = 3;
            const gameMessage3 = `
                <div class="game-question">🎯 Угадай слово</div>
                <div>Слово: ${currentGame.hidden}</div>
                <div>Подсказка: ${data.hint}</div>
                <div class="game-stats">
                    <span>Букв: ${data.word.length}</span>
                    <span>Попытки: 3</span>
                </div>
            `;
            sendGameMessage(gameMessage3);
            break;
            
        case 'guessEmotion':
            currentGame.emotion = data.emotion;
            currentGame.state = 'guessing';
            currentGame.showingPlayer = data.showingPlayer;
            const gameMessage4 = `
                <div class="game-question">😊 Угадай эмоцию</div>
                <div>Собеседник показывает эмоцию...</div>
                <div>Вы угадываете</div>
                <div class="game-stats">
                    <span>Время: 60 сек</span>
                </div>
            `;
            sendGameMessage(gameMessage4);
            break;
    }
}

function handleGameAnswer(data) {
    if (!currentGame) return;
    
    switch (currentGame.type) {
        case 'quiz':
            currentGame.answers[data.playerId] = {
                answer: data.answer,
                correct: data.correct
            };
            
            const allPlayersAnswered = Object.keys(currentGame.answers).length === 2;
            if (allPlayersAnswered) {
                endQuizGame();
            }
            break;
    }
}

window.loadChatsFromServer = async function() {
    try {
        console.log('📡 Загрузка активных чатов с сервера...');
        const response = await fetch(API_URL + '/api/chats');
        
        if (!response.ok) {
            throw new Error('Ошибка сервера: ' + response.status);
        }
        
        const chats = await response.json();
        console.log('✅ Загружено чатов с сервера:', chats.length);
        
        const activeChats = chats.filter(chat => chat.participants_count === 1);
        
        return activeChats.map(chat => ({
            id: chat.id,
            gender: chat.user_gender + ', ' + chat.user_age,
            lookingFor: chat.partner_gender + ', ' + chat.min_age + '-' + chat.max_age,
            theme: chat.theme,
            participants_count: chat.participants_count,
            timestamp: new Date(chat.created_at).getTime(),
            userId: chat.user_id
        }));
    } catch (error) {
        console.error('❌ Ошибка загрузки чатов:', error);
        showNotification('Ошибка загрузки чатов');
        return [];
    }
}

async function loadAndRenderChats() {
    console.log('🔄 Загрузка и отрисовка активных чатов...');
    const chats = await window.loadChatsFromServer();
    allChats = chats;
    renderChatsList();
}

function renderChatsList() {
    const container = document.getElementById('chatsContainer');
    if (!container) return;
    
    const filteredChats = allChats.filter(chat => chat.theme === currentTheme);

    container.innerHTML = '';

    if (filteredChats.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">💬</div>
                <div class="empty-text">Активных чатов в разделе "${currentTheme}" пока нет</div>
                <div style="font-size: 13px; margin-top: 6px; color: var(--text-secondary);">Создайте первый чат!</div>
            </div>
        `;
        return;
    }
    
    filteredChats.forEach(chat => {
        const chatElement = document.createElement('div');
        chatElement.className = 'user-card';
        chatElement.onclick = () => startChat(chat);
        
        chatElement.innerHTML = `
            <div class="user-info">
                <div class="info-row">
                    <span class="info-label">Пол:</span>
                    <span class="info-value">${chat.gender}</span>
                </div>
                <div class="info-row">
                    <span class="info-label">Ищу:</span>
                    <span class="info-value">${chat.lookingFor}</span>
                </div>
            </div>
            <div class="chat-footer">
                <div class="theme-tag">${chat.theme}</div>
                <div class="chat-time">${getTimeAgo(chat.timestamp)}</div>
            </div>
        `;
        container.appendChild(chatElement);
    });
}

function openCreateChatModal() {
    const modal = document.getElementById('createChatModal');
    const modalTitle = document.getElementById('modalTitle');
    
    if (modal && modalTitle) {
        modalTitle.textContent = 'Создать чат для ' + currentTheme;
        modal.style.display = 'block';
    }
}

function closeCreateChatModal() {
    const modal = document.getElementById('createChatModal');
    if (modal) {
        modal.style.display = 'none';
    }
}

function updateMyAge() {
    const slider = document.getElementById('myAgeSlider');
    const valueDisplay = document.getElementById('myAgeValue');
    
    if (slider && valueDisplay) {
        valueDisplay.textContent = slider.value;
    }
}

function updateAgeRange() {
    const minSlider = document.getElementById('minAgeSlider');
    const maxSlider = document.getElementById('maxAgeSlider');
    const minAgeValue = document.getElementById('minAgeValue');
    const maxAgeValue = document.getElementById('maxAgeValue');
    
    if (!minSlider || !maxSlider || !minAgeValue || !maxAgeValue) return;
    
    let minAge = parseInt(minSlider.value);
    let maxAge = parseInt(maxSlider.value);
    
    if (minAge > maxAge) {
        minAge = maxAge;
        minSlider.value = minAge;
    }
    
    minAgeValue.textContent = minAge;
    maxAgeValue.textContent = maxAge;
}

async function createChat() {
    console.log('🔍 Начинаем создание чата...');
    
    const myGenderElement = document.querySelector('#myGenderOptions .option-button.active');
    const myAgeSlider = document.getElementById('myAgeSlider');
    const partnerGenderElement = document.querySelector('#partnerGenderOptions .option-button.active');
    const minAgeElement = document.getElementById('minAgeValue');
    const maxAgeElement = document.getElementById('maxAgeValue');

    if (!myGenderElement || !myAgeSlider || !partnerGenderElement || !minAgeElement || !maxAgeElement) {
        showNotification('❌ Ошибка: не все поля заполнены');
        return;
    }

    const myGender = myGenderElement.textContent;
    const myAge = parseInt(myAgeSlider.value);
    const partnerGender = partnerGenderElement.textContent;
    const minAge = parseInt(minAgeElement.textContent);
    const maxAge = parseInt(maxAgeElement.textContent);

    if (!myGender || !partnerGender) {
        showNotification('❌ Пожалуйста, выберите пол');
        return;
    }

    if (!myAge || myAge < 18 || myAge > 80) {
        showNotification('❌ Пожалуйста, введите корректный возраст (18-80)');
        return;
    }

    if (!minAge || !maxAge || minAge >= maxAge || minAge < 18 || maxAge > 80) {
        showNotification('❌ Пожалуйста, введите корректный возрастной диапазон (18-80)');
        return;
    }

    lastChatParams = {
        myGender: myGender,
        myAge: myAge,
        partnerGender: partnerGender,
        minAge: minAge,
        maxAge: maxAge,
        theme: currentTheme
    };

    const chatData = {
        user_id: window.vkUser?.id || 'anonymous',
        user_gender: myGender,
        user_age: myAge,
        partner_gender: partnerGender,
        min_age: minAge,
        max_age: maxAge,
        theme: currentTheme
    };

    console.log('📨 Отправляем данные на сервер:', chatData);

    try {
        const response = await fetch(API_URL + '/api/chats', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(chatData)
        });
        
        console.log('📡 Ответ сервера:', response.status);
        
        if (response.ok) {
            const result = await response.json();
            console.log('✅ Чат создан на сервере:', result);
            
            const newChat = {
                id: result.id,
                gender: myGender + ', ' + myAge,
                lookingFor: partnerGender + ', ' + minAge + '-' + maxAge,
                theme: currentTheme,
                participants_count: 1,
                timestamp: Date.now(),
                userId: window.vkUser?.id || 'anonymous'
            };
            
            allChats.unshift(newChat);
            renderChatsList();
            
            if (window.socket) {
                window.socket.emit('new_chat_created', newChat);
            }
            
            userStats.createdChats++;
            saveUserStats();
            updateProfileStats();
            showNotification('✅ Чат успешно создан! Ожидаем собеседника... 🎮');
            closeCreateChatModal();
            
            showWaitingScreen(newChat, lastChatParams);
            
        } else {
            const errorText = await response.text();
            console.error('❌ Ошибка сервера:', errorText);
            throw new Error('Ошибка сервера: ' + response.status);
        }
    } catch (error) {
        console.error('❌ Ошибка создания чата:', error);
        showNotification('❌ Ошибка создания чата: ' + error.message);
    }
}

function showWaitingScreen(chat, params) {
    console.log('⏳ Показываем экран ожидания для чата:', chat.id);
    
    waitingChatId = chat.id;
    
    document.getElementById('waitingMyGender').textContent = params.myGender;
    document.getElementById('waitingMyAge').textContent = params.myAge;
    document.getElementById('waitingPartnerGender').textContent = params.partnerGender === 'Любой' ? 'Любой пол' : params.partnerGender;
    document.getElementById('waitingPartnerAge').textContent = params.minAge + '-' + params.maxAge + ' лет';
    
    showScreen('waitingScreen');
}

function cancelWaiting() {
    console.log('❌ Отмена поиска собеседника для чата:', waitingChatId);
    
    if (waitingChatId && window.socket) {
        window.socket.emit('leave_chat', { 
            chatId: waitingChatId, 
            userId: window.vkUser?.id 
        });
    }
    
    waitingChatId = null;
    showScreen('chatsScreen');
    showNotification('🔍 Поиск собеседника отменен');
}

function modifySearch() {
    console.log('🔧 Изменение критериев поиска');
    
    waitingChatId = null;
    showScreen('chatsScreen');
    openCreateChatModal();
}

async function startChat(chat) {
    console.log('💬 Запуск чата:', chat.id);
    
    shownModals.clear();
    
    if (window.currentChat && window.socket) {
        window.socket.emit('leave_chat', { chatId: window.currentChat.id, userId: window.vkUser?.id });
    }
    
    window.currentChat = chat;
    
    const chatRoomTitle = document.getElementById('chatRoomTitle');
    if (chatRoomTitle) {
        chatRoomTitle.textContent = getChatEmoji(chat.theme) + ' ' + chat.theme;
    }
    
    showScreen('chatRoomScreen');
    
    const messagesContainer = document.getElementById('messagesContainer');
    if (messagesContainer) {
        messagesContainer.innerHTML = `
            <div class="empty-chat">
                <div class="empty-icon">💭</div>
                <div>Загружаем чат...</div>
            </div>
        `;
    }
    
    if (window.socket) {
        window.socket.emit('set_user_id', window.vkUser?.id || 'anonymous');
        window.socket.emit('join_chat', { 
            chatId: chat.id, 
            userId: window.vkUser?.id || 'anonymous' 
        });
    }
    
    await loadMessages(chat.id);
    
    setTimeout(() => {
        const input = document.getElementById('messageInput');
        if (input) input.focus();
    }, 300);
}

function getChatEmoji(theme) {
    const emojiMap = {
        'Общение': '💬',
        'Флирт': '😊',
        'Игры': '🎮'
    };
    return emojiMap[theme] || '💬';
}

async function loadMessages(chatId) {
    try {
        console.log('📨 Загрузка сообщений для чата:', chatId);
        const response = await fetch(API_URL + '/api/messages?chat_id=' + chatId);
        
        if (!response.ok) {
            throw new Error('Ошибка загрузки сообщений: ' + response.status);
        }
        
        const messages = await response.json();
        console.log('✅ Загружено сообщений:', messages.length);
        
        renderMessages(messages);
        
    } catch (error) {
        console.error('❌ Ошибка загрузки сообщений:', error);
    }
}

function renderMessages(messages) {
    const container = document.getElementById('messagesContainer');
    if (!container) return;
    
    container.innerHTML = '';
    
    if (messages.length === 0) {
        container.innerHTML = `
            <div class="empty-chat">
                <div class="empty-icon">💭</div>
                <div>Пока нет сообщений</div>
                <div style="font-size: 13px; margin-top: 6px;">Начните общение или сыграйте в игру! 🎮</div>
            </div>
        `;
        return;
    }
    
    messages.forEach(msg => {
        addMessageToChat(msg);
    });
    
    container.scrollTop = container.scrollHeight;
}

function addMessageToChat(message) {
    const container = document.getElementById('messagesContainer');
    if (!container) return;
    
    if (container.innerHTML.includes('Пока нет сообщений') || container.innerHTML.includes('Загружаем чат')) {
        container.innerHTML = '';
    }
    
    const messageElement = document.createElement('div');
    const isMyMessage = message.user_id === (window.vkUser?.id || 'anonymous');
    messageElement.className = 'message ' + (isMyMessage ? 'message-my' : 'message-their');
    
    const messageContent = `
        <div class="message-content">${escapeHtml(message.message)}</div>
        <div class="message-time">${new Date(message.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</div>
    `;
    
    messageElement.innerHTML = messageContent;
    container.appendChild(messageElement);
    container.scrollTop = container.scrollHeight;
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function handleTyping() {
    if (!window.currentChat || !window.socket) return;
    
    window.socket.emit('typing_start', { 
        chatId: window.currentChat.id, 
        userId: window.vkUser?.id 
    });
    
    clearTimeout(typingTimer);
    typingTimer = setTimeout(() => {
        window.socket.emit('typing_stop', { 
            chatId: window.currentChat.id, 
            userId: window.vkUser?.id 
        });
    }, 1000);
}

async function sendMessage() {
    const input = document.getElementById('messageInput');
    if (!input) return;
    
    const text = input.value.trim();
    
    if (!text || !window.currentChat) {
        return;
    }

    // Проверяем, является ли сообщение попыткой угадать слово или эмоцию в игре
    if (currentGame) {
        if (currentGame.type === 'guessWord') {
            handleGuessWordAttempt(text);
            input.value = '';
            return;
        } else if (currentGame.type === 'guessEmotion' && currentGame.state === 'guessing') {
            handleGuessEmotionAttempt(text);
            input.value = '';
            return;
        }
    }

    try {
        const response = await fetch(API_URL + '/api/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                chat_id: window.currentChat.id,
                user_id: window.vkUser?.id || 'anonymous',
                message: text
            })
        });
        
        if (response.ok) {
            input.value = '';
            userStats.sentMessages++;
            saveUserStats();
            updateProfileStats();
            
            if (window.socket) {
                window.socket.emit('typing_stop', { 
                    chatId: window.currentChat.id, 
                    userId: window.vkUser?.id 
                });
            }
        } else {
            throw new Error('Ошибка отправки: ' + response.status);
        }
    } catch (error) {
        console.error('❌ Ошибка отправки сообщения:', error);
        showNotification('❌ Ошибка отправки сообщения');
    }
}

function showScreen(screenId) {
    console.log('🔄 Переключение на экран:', screenId);
    
    closeAllModals();
    closeGamesMenu();
    
    document.querySelectorAll('.screen').forEach(screen => screen.classList.remove('active'));
    
    const targetScreen = document.getElementById(screenId);
    if (targetScreen) {
        targetScreen.classList.add('active');
    }
    
    updateMenuActiveState(screenId);
    toggleBottomMenu(screenId);
    
    if (screenId !== 'chatRoomScreen' && screenId !== 'waitingScreen' && window.currentChat && window.socket) {
        window.socket.emit('leave_chat', { chatId: window.currentChat.id, userId: window.vkUser?.id });
        window.currentChat = null;
    }
    
    if (screenId !== 'waitingScreen') {
        waitingChatId = null;
    }
    
    if (screenId !== 'chatRoomScreen') {
        currentGame = null;
    }
}

function updateMenuActiveState(screenId) {
    const menuItems = document.querySelectorAll('.bottom-menu .menu-item');
    menuItems.forEach(item => item.classList.remove('active'));
    
    const menuIndex = {
        'chatsScreen': 0,
        'profileScreen': 1,
        'settingsScreen': 2
    }[screenId];
    
    if (menuIndex !== undefined && menuItems[menuIndex]) {
        menuItems[menuIndex].classList.add('active');
    }
}

function toggleBottomMenu(screenId) {
    const bottomMenu = document.querySelector('.bottom-menu');
    if (bottomMenu) {
        if (screenId === 'chatRoomScreen' || screenId === 'waitingScreen') {
            bottomMenu.style.display = 'none';
        } else {
            bottomMenu.style.display = 'flex';
        }
    }
}

function toggleOption(element) {
    if (!element) return;
    
    const parent = element.parentElement;
    if (!parent) return;
    
    parent.querySelectorAll('.option-button').forEach(btn => btn.classList.remove('active'));
    element.classList.add('active');
}

function closeAllModals() {
    const tempModals = document.querySelectorAll('.modal-overlay');
    tempModals.forEach(modal => {
        if (!modal.id) {
            modal.remove();
        }
    });
    
    const createChatModal = document.getElementById('createChatModal');
    if (createChatModal) {
        createChatModal.style.display = 'none';
    }
    
    const themeModal = document.getElementById('themeModal');
    if (themeModal) {
        themeModal.style.display = 'none';
    }
    
    shownModals.clear();
}

function loadUserStats() {
    try {
        const savedStats = localStorage.getItem('user_stats');
        if (savedStats) {
            userStats = JSON.parse(savedStats);
        }
        
        const firstVisit = localStorage.getItem('first_visit');
        if (!firstVisit) {
            localStorage.setItem('first_visit', Date.now().toString());
        } else {
            const days = Math.floor((Date.now() - parseInt(firstVisit)) / (1000 * 60 * 60 * 24));
            userStats.daysActive = Math.max(1, days);
        }
    } catch (error) {
        console.error('❌ Ошибка загрузки статистики:', error);
    }
}

function saveUserStats() {
    try {
        localStorage.setItem('user_stats', JSON.stringify(userStats));
    } catch (error) {
        console.error('❌ Ошибка сохранения статистики:', error);
    }
}

function updateProfileStats() {
    const elements = {
        'chatsCount': userStats.createdChats,
        'gamesCount': userStats.gamesPlayed,
        'achievementsCount': userStats.achievements.length,
        'friendsCount': userStats.friends,
        'profileLevel': userStats.level,
        'profileXP': userStats.xp + '/100'
    };
    
    Object.entries(elements).forEach(([id, value]) => {
        const element = document.getElementById(id);
        if (element) {
            element.textContent = value;
        }
    });
}

function getTimeAgo(timestamp) {
    const diff = Date.now() - timestamp;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    
    if (minutes < 1) return 'только что';
    if (minutes < 60) return minutes + ' мин назад';
    if (hours < 24) return hours + ' ч назад';
    return Math.floor(hours / 24) + ' дн назад';
}

function showNotification(message) {
    const existingSnackbars = document.querySelectorAll('.snackbar');
    existingSnackbars.forEach(snackbar => {
        if (snackbar.parentNode) {
            snackbar.remove();
        }
    });
    
    const snackbar = document.createElement('div');
    snackbar.className = 'snackbar';
    snackbar.textContent = message;
    document.body.appendChild(snackbar);
    
    setTimeout(() => {
        if (snackbar.parentNode) {
            snackbar.remove();
        }
    }, 3000);
}

function setupEventListeners() {
    console.log('🔧 Настройка обработчиков событий...');
    
    document.querySelectorAll('.modal-overlay').forEach(modal => {
        modal.addEventListener('click', function(e) {
            if (e.target === this) {
                this.style.display = 'none';
            }
        });
    });

    const messageInput = document.getElementById('messageInput');
    if (messageInput) {
        messageInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                sendMessage();
            }
        });
        
        messageInput.addEventListener('input', handleTyping);
    }

    const myAgeSlider = document.getElementById('myAgeSlider');
    const minSlider = document.getElementById('minAgeSlider');
    const maxSlider = document.getElementById('maxAgeSlider');
    
    if (myAgeSlider) {
        myAgeSlider.addEventListener('input', updateMyAge);
    }
    
    if (minSlider && maxSlider) {
        minSlider.addEventListener('input', updateAgeRange);
        maxSlider.addEventListener('input', updateAgeRange);
    }
    
    updateMyAge();
    updateAgeRange();
}

function enableNotifications() {
    if ('Notification' in window) {
        Notification.requestPermission().then(permission => {
            if (permission === 'granted') {
                showNotification('✅ Уведомления включены');
            } else {
                showNotification('❌ Уведомления отключены');
            }
        });
    } else {
        showNotification('❌ Браузер не поддерживает уведомления');
    }
}

function shareApp() {
    if (navigator.share) {
        navigator.share({
            title: 'Анонимный чат + Игры',
            text: 'Общайся анонимно и играй в реальном времени! 🎮',
            url: window.location.href
        });
    } else {
        showNotification('📱 Поделитесь ссылкой: ' + window.location.href);
    }
}

function openMyChats() {
    showScreen('chatsScreen');
    showNotification('📋 Переход к списку чатов');
}

function inviteFriends() {
    showNotification('👥 Функция приглашения друзей в разработке');
}

function openNotificationsSettings() {
    showNotification('🔔 Настройки уведомлений в разработке');
}

function openPrivacySettings() {
    showNotification('🔒 Настройки конфиденциальности в разработке');
}

function addToFavorites() {
    showNotification('⭐ Добавлено в избранное');
}

function openAppInfo() {
    showNotification('ℹ️ Версия 2.0 с играми | Анонимный чат');
}

function support() {
    showNotification('📞 Связь с поддержкой: support@chat.ru');
}

function leaveChat() {
    if (window.currentChat && window.socket) {
        window.socket.emit('leave_chat', { 
            chatId: window.currentChat.id, 
            userId: window.vkUser?.id 
        });
    }
    showScreen('chatsScreen');
    showNotification('🚪 Вы вышли из чата');
}

function showPartnerLeftModal(chatId) {
    if (shownModals.has(chatId)) {
        return;
    }
    
    shownModals.add(chatId);
    
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.style.display = 'block';
    modal.innerHTML = `
        <div class="modal-content" style="text-align: center; max-width: 280px;">
            <div class="modal-header">
                <div class="modal-title">👤 Собеседник покинул чат</div>
            </div>
            <div style="padding: 16px;">
                <p style="margin-bottom: 16px;">Чат был удален из системы. Что вы хотите сделать?</p>
                <div style="display: flex; flex-direction: column; gap: 10px; align-items: center;">
                    <button class="action-button" onclick="recreateChat('${chatId}')" style="width: 100%;">
                        🔄 Создать такой же чат
                    </button>
                    <button class="action-button" onclick="goToChats('${chatId}')" style="width: 100%;">
                        💬 Вернуться к чатам
                    </button>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
}

function recreateChat(chatId) {
    closeAllModals();
    shownModals.delete(chatId);
    
    if (lastChatParams) {
        createChatWithParams(lastChatParams);
    } else {
        showScreen('chatsScreen');
    }
}

function goToChats(chatId) {
    closeAllModals();
    shownModals.delete(chatId);
    showScreen('chatsScreen');
}

function createChatWithParams(params) {
    if (window.currentChat && window.socket) {
        window.socket.emit('leave_chat', { chatId: window.currentChat.id, userId: window.vkUser?.id });
    }
    
    window.currentChat = null;
    
    const chatData = {
        user_id: window.vkUser?.id || 'anonymous',
        user_gender: params.myGender,
        user_age: params.myAge,
        partner_gender: params.partnerGender,
        min_age: params.minAge,
        max_age: params.maxAge,
        theme: params.theme
    };

    fetch(API_URL + '/api/chats', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(chatData)
    })
    .then(response => {
        if (!response.ok) {
            throw new Error('Ошибка сервера: ' + response.status);
        }
        return response.json();
    })
    .then(result => {
        console.log('✅ Новый чат создан:', result);
        
        userStats.createdChats++;
        saveUserStats();
        updateProfileStats();
        
        const newChat = {
            id: result.id,
            gender: params.myGender + ', ' + params.myAge,
            lookingFor: params.partnerGender + ', ' + params.minAge + '-' + params.maxAge,
            theme: params.theme,
            participants_count: 1,
            timestamp: Date.now(),
            userId: window.vkUser?.id || 'anonymous'
        };
        
        allChats.unshift(newChat);
        renderChatsList();
        
        if (window.socket) {
            window.socket.emit('new_chat_created', newChat);
        }
        
        showWaitingScreen(newChat, params);
    })
    .catch(error => {
        console.error('❌ Ошибка создания чата:', error);
        showNotification('❌ Ошибка создания чата: ' + error.message);
        showScreen('chatsScreen');
    });
}

// Запуск приложения
document.addEventListener('DOMContentLoaded', function() {
    console.log('📄 DOM загружен, запускаем приложение с играми...');
    initApp();
});

// Глобальные функции для HTML
window.switchChatTab = switchChatTab;
window.openCreateChatModal = openCreateChatModal;
window.closeCreateChatModal = closeCreateChatModal;
window.toggleOption = toggleOption;
window.createChat = createChat;
window.showScreen = showScreen;
window.sendMessage = sendMessage;
window.handleTyping = handleTyping;
window.recreateChat = recreateChat;
window.goToChats = goToChats;
window.enableNotifications = enableNotifications;
window.shareApp = shareApp;
window.openMyChats = openMyChats;
window.inviteFriends = inviteFriends;
window.openNotificationsSettings = openNotificationsSettings;
window.openPrivacySettings = openPrivacySettings;
window.addToFavorites = addToFavorites;
window.openAppInfo = openAppInfo;
window.support = support;
window.leaveChat = leaveChat;

// Функции для системы тем
window.openThemeSettings = openThemeSettings;
window.closeThemeModal = closeThemeModal;
window.selectTheme = selectTheme;

// Функции для экрана ожидания
window.cancelWaiting = cancelWaiting;
window.modifySearch = modifySearch;

// Функции для игр
window.openGamesMenu = openGamesMenu;
window.closeGamesMenu = closeGamesMenu;
window.startGame = startGame;
window.answerQuiz = answerQuiz;
window.handleGuessWordAttempt = handleGuessWordAttempt;
window.handleGuessEmotionAttempt = handleGuessEmotionAttempt;
