import discord
import os
import google.generativeai as genai
from dotenv import load_dotenv

# .envファイルから環境変数を読み込む
load_dotenv()

# 環境変数からAPIキーとトークンを取得
DISCORD_BOT_TOKEN = os.getenv('DISCORD_BOT_TOKEN')
GEMINI_API_KEY = os.getenv('GEMINI_API_KEY')

# --- ここでGeminiの設定を行う ---
# genai.configure(api_key=GEMINI_API_KEY) # ← 後で有効化します

# Discordのクライアントを作成 (インテントを設定)
intents = discord.Intents.default()
intents.message_content = True # メッセージの内容を読み取るために必要
client = discord.Client(intents=intents)

# ボットが起動したときの処理
@client.event
async def on_ready():
    print(f'We have logged in as {client.user}')
    # ここに後でキャッシュ用の辞書を初期化するコードなどを追加します
    # cache = {}

# メッセージが送信されたときの処理 (ここは後で本格的に実装します)
@client.event
async def on_message(message):
    # ボット自身のメッセージは無視する
    if message.author == client.user:
        return

    # とりあえず"hello"に反応するテスト (後でYouTube URL処理に置き換える)
    if message.content.startswith('hello'):
        await message.channel.send('Hello!')

    # --- ここにYouTube URLを検出して要約する処理を追加していく ---

# ボットを実行
if DISCORD_BOT_TOKEN is None:
    print("エラー: DISCORD_BOT_TOKENが設定されていません。")
elif GEMINI_API_KEY is None:
    print("エラー: GEMINI_API_KEYが設定されていません。")
else:
    try:
        # Gemini APIが正しく設定されているか試す (オプション)
        # genai.configure(api_key=GEMINI_API_KEY) # ← 後で有効化
        # test_model = genai.GenerativeModel('gemini-1.5-flash') # ← 後で有効化
        # test_response = test_model.generate_content("Test") # ← 後で有効化
        # print("Gemini API接続テストOK") # ← 後で有効化

        client.run(DISCORD_BOT_TOKEN)
    except Exception as e:
        print(f"ボットの起動中にエラーが発生しました: {e}")
        # 特に Gemini API キーが不正な場合にここでエラーが出ることがあります。
        # 例: google.api_core.exceptions.PermissionDenied: 403 Your API key is invalid...