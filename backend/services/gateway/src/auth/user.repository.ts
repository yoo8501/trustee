import { prisma } from "../db";

interface CreateUserData {
  email: string;
  passwordHash: string;
  name: string;
}

export class UserRepository {
  async findByEmail(email: string) {
    return prisma.user.findUnique({
      where: { email },
    });
  }

  async findById(id: string) {
    return prisma.user.findUnique({
      where: { id },
    });
  }

  async create(data: CreateUserData) {
    return prisma.user.create({
      data,
    });
  }
}
