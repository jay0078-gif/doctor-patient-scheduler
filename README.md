# Doctor-Patient Appointment Booking System

## Tech Stack
- NestJS
- TypeScript
- PostgreSQL
- TypeORM
- JWT Authentication
- bcrypt
- Nodemailer

## Features
- Doctor & Patient signup/login with JWT
- Auto-calculated daily slots
- Sunday rejection
- Next 3 available dates when fully booked
- Token number + reporting time
- Email notification when fully booked

## API Endpoints
- POST /auth/signup/doctor
- POST /auth/signup/patient
- POST /auth/login/doctor
- POST /auth/login/patient
- POST /appointments (JWT protected)

## Setup
1. Clone the repo
2. npm install
3. Configure .env file
4. npm run start:dev
