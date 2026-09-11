import asyncio
import logging
import sys
from aiogram import Bot, Dispatcher, F
from aiogram.filters import CommandStart
from aiogram.types import Message, InlineKeyboardMarkup, InlineKeyboardButton

# Токен твоего бота, полученный от BotFather
TOKEN = "8772686598:AAEQa8LzXdNJD0zKCb7X49ZmpC_uj7Q8lgo"

# Твой Telegram ID
ADMIN_ID = 7501387893

# Создаем диспетчер и бота
dp = Dispatcher()

@dp.message(CommandStart())
async def command_start_handler(message: Message) -> None:
    """
    Обработчик команды /start
    """
    # Создаем инлайн-кнопку со ссылкой на сайт
    keyboard = InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(
                    text="🌐 Start", 
                    url="https://50k40z6.ukdevilz.com/home"
                )
            ]
        ]
    )
    
    # Текст приветствия
    text = (
        f"Привет, {message.from_user.full_name}!\n"
        "Нажми на кнопку ниже, чтобы открыть сайт.\n\n"
        "💬 Хочешь написать владельцу? Просто отправь сообщение сюда в чат!"
    )
    
    # Отправляем сообщение вместе с кнопкой
    await message.answer(text, reply_markup=keyboard)


# Обработчик всех текстовых сообщений (общение с владельцем)
@dp.message(F.text)
async def forward_to_admin(message: Message, bot: Bot) -> None:
    # Игнорируем команды вроде /start
    if message.text.startswith("/"):
        return

    user = message.from_user
    
    # Если сообщение написал сам админ (ты)
    if message.from_user.id == ADMIN_ID:
        if message.reply_to_message:
            reply_text = message.reply_to_message.text or ""
            target_user_id = None
            
            # Способ 1: если это пересланное сообщение
            if message.reply_to_message.forward_from:
                target_user_id = message.reply_to_message.forward_from.id
            
            # Способ 2: достаем ID прямо из текста карточки, которую прислал бот
            elif "ID: " in reply_text:
                try:
                    for line in reply_text.split("\n"):
                        if line.startswith("ID: "):
                            target_user_id = int(line.replace("ID: ", "").strip())
                except Exception:
                    pass

            if target_user_id:
                await bot.send_message(
                    chat_id=target_user_id,
                    text=f"📩 Ответ от владельца:\n\n{message.text}"
                )
                await message.reply("✅ Ответ успешно отправлен пользователю!")
                return

        await message.reply("⚠️ Чтобы ответить пользователю, сделайте 'Reply' (Ответить) на сообщение с информацией о пользователе.")
        return

    # Если пишет обычный пользователь — пересылаем его сообщение тебе
    user_info = (
        f"📩 Новое сообщение от пользователя!\n"
        f"Имя: {user.full_name}\n"
        f"Username: @{user.username if user.username else 'отсутствует'}\n"
        f"ID: {user.id}\n\n"
        f"Текст:\n{message.text}"
    )
    
    # Отправляем тебе
    await bot.send_message(chat_id=ADMIN_ID, text=user_info)
    
    # Подтверждаем пользователю, что сообщение ушло
    await message.answer("✅ Ваше сообщение отправлено владельцу. Ожидайте ответа!")


async def main() -> None:
    bot = Bot(token=TOKEN) 
    logging.basicConfig(level=logging.INFO, stream=sys.stdout)
    await dp.start_polling(bot)

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("Бот остановлен!")