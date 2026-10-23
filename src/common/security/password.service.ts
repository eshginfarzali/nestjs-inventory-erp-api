import { Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';

/** Argon2id password hashing (OWASP-recommended parameters are the library defaults). */
@Injectable()
export class PasswordService {
  /** Hash used to keep login timing similar when the email does not exist. */
  private dummyHash?: Promise<string>;

  hash(plain: string): Promise<string> {
    return argon2.hash(plain, { type: argon2.argon2id });
  }

  async verify(hash: string, plain: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, plain);
    } catch {
      return false;
    }
  }

  /** Burns comparable CPU time to `verify` and always resolves to false. */
  async verifyAgainstDummy(plain: string): Promise<false> {
    this.dummyHash ??= this.hash('dummy-password-for-timing');
    await this.verify(await this.dummyHash, plain);
    return false;
  }
}
