import 'reflect-metadata';
import { Logger } from '@nestjs/common';

// Unit tests assert on behaviour, not on log output.
Logger.overrideLogger(false);
