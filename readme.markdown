### prerequisites

> install dependencies

```shell
python -m pip install flask requests python-dotenv
```

> get api key for each captcha from the official admin
> create a `.env` file and put it under root dir
> write in these env vars

```dotenv
GOOGLE_SITE_KEY=
GOOGLE_SECRET_KEY=

HCAPTCHA_SITE_KEY=
HCAPTCHA_SECRET_KEY=

GEETEST_GOBANG_ID=
GEETEST_GOBANG_KEY=
GEETEST_ICON_ID=
GEETEST_ICON_KEY=
```

### how to run

> https://dashboard.ngrok.com/get-started/setup/windows

```python
python app.py
ngrok http 5000
```

Data should be collected in `user_study_data.csv`.