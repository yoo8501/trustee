interface User {
  id: string;
  name: string;
  email: string;
}

interface CreateUserRequest {
  name: string;
  email: string;
}

interface UpdateUserRequest {
  name?: string;
  email?: string;
}

const BASE_URL = "/api/users";

export async function getUsers(): Promise<User[]> {
  const response = await fetch(BASE_URL);
  return response.json();
}

export async function getUser(id: string): Promise<User> {
  const response = await fetch(`${BASE_URL}/${id}`);
  return response.json();
}

export async function createUser(data: CreateUserRequest): Promise<User> {
  const response = await fetch(BASE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  return response.json();
}

export async function updateUser(
  id: string,
  data: UpdateUserRequest
): Promise<User> {
  const response = await fetch(`${BASE_URL}/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  return response.json();
}

export async function deleteUser(id: string): Promise<void> {
  await fetch(`${BASE_URL}/${id}`, { method: "DELETE" });
}
