/** Base of everything core throws on purpose, so a client can catch the whole family and map it to its own vocabulary. */
export class CoreError extends Error {
	constructor(message: string, options?: ErrorOptions) {
		super(message, options);
		this.name = new.target.name; // else every subclass logs as "Error"
	}
}

/** A record was asked for by id, slug, or number and does not exist. */
export class NotFoundError extends CoreError {}

/** The operation would break a rule of the model. */
export class InvalidOperationError extends CoreError {}

/** No live session behind the token. Thrown by Api only. */
export class UnauthorizedError extends CoreError {}

/** The user may not do this: no or too low a role in the space, or not an admin. Thrown by Api only. */
export class ForbiddenError extends CoreError {}
