import os


def security_code_verification(code):
    localSecurityCode = os.environ.get('SECURITY_CODE');

    if localSecurityCode is None:
        print('环境变量中没有设置正确的security code，无法完成验证')
        return False

    return localSecurityCode == code
