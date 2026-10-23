/**
 * Remote decorators and explicit Gateway bindings backed by versioned
 * descriptors carried on decorated class prototypes. Strict reflection
 * remains a Typert compiler responsibility.
 * @module @deepseek-ai/dsh-typert-protocol
 */
import { Context, Service } from '@deepseek-ai/cordis';
export { RemoteError, remoteErrorOf } from "./remote-error.js";
export { TYPERT_OWNED_VALUE, isTypertOwnedValue, typertOwnedValue } from "./owned-value.js";
export { isRemoteJsonValue, isRemoteUplinkItem } from "./json-value.js";
export { createTypertRemoteInfo, isTypertRemoteMethod } from "./remote-info.js";
export { principalOf } from "./principal.js";
const TYPERT_REMOTE_SEGMENT_PATTERN = /^[A-Za-z0-9_$.-]+$/;
/**
 * Test one generated Remote name against the Connection endpoint grammar.
 * @param value - namespace, method, lookup, or Context segment.
 * @returns whether the value can cross the shared RPC carrier unchanged.
 */
export function isTypertRemoteSegment(value) {
    return value !== '.' && value !== '..' && TYPERT_REMOTE_SEGMENT_PATTERN.test(value);
}
const REMOTE_METHOD_DESCRIPTOR = '@deepseek-ai/dsh-typert-protocol/remote-methods';
/**
 * Bind one visible Service field to a Cordis key and Remote namespace. A
 * service that owns a Cordis Context also gives its tree `ctx.invocation`,
 * `undefined` outside a Remote call, so no `TypertRemoteService` is needed for
 * a Host composition to read it.
 * @param service - owning Service instance, normally `this`.
 * @param serviceKey - exact Cordis service key.
 * @param options - optional wire namespace.
 * @returns a frozen, inspectable binding with no compiler-injected metadata.
 */
export function bindTypertRemote(service, serviceKey, options = {}) {
    validateName('service key', serviceKey);
    const namespace = options.namespace ?? serviceKey;
    validateName('namespace', namespace);
    const ctx = Reflect.get(service, 'ctx');
    if (Context.is(ctx))
        provideInvocationAccessor(ctx);
    return Object.freeze({ service, serviceKey, namespace });
}
/** Cordis Service base that exposes its registered name through Typert Gateway. */
export class TypertRemoteService extends Service {
    /** Visible binding consumed by the Gateway's source-mode discovery. */
    typertRemote;
    /**
     * Register the Service and bind the same key to Typert Gateway.
     * @param ctx - owning Cordis Context.
     * @param serviceKey - exact Cordis service key and default wire namespace.
     * @param options - optional wire namespace.
     */
    constructor(ctx, serviceKey, options = {}) {
        super(ctx, serviceKey);
        this.typertRemote = bindTypertRemote(this, this.name, options);
    }
}
/**
 * Make `ctx.invocation` read as `undefined` outside a Remote call instead of the
 * reflect service's "cannot get property" error; a call-derived Context shadows
 * the accessor with its own property. The first Remote Service constructed in a
 * tree registers it on the root, where it outlives any one Service.
 */
function provideInvocationAccessor(ctx) {
    if (Object.hasOwn(ctx.root.reflect.props, 'invocation'))
        return;
    ctx.root.accessor('invocation', { get: () => undefined });
}
export function Remote(methodExportOrOptions, context) {
    if (typeof methodExportOrOptions === 'string') {
        validateName('Remote export name', methodExportOrOptions);
        return remoteDecorator({ kind: 'direct' }, { exportName: methodExportOrOptions });
    }
    if (typeof methodExportOrOptions === 'object') {
        return remoteDecorator({ kind: 'direct' }, markerOptions(methodExportOrOptions, REMOTE_OPTION_KEYS, 'Remote options require name, mode: "stream", or resources'));
    }
    if (context === undefined)
        throw new TypeError('typert-protocol: Remote decorator context is missing');
    addMarkerInitializer(context, { kind: 'direct' });
}
const REMOTE_OPTION_KEYS = new Set(['name', 'mode', 'resources']);
const REMOTE_SCOPE_OPTION_KEYS = new Set(['name', 'resources']);
/** Validate one decorator options object against its accepted keys and select the marker fields. */
function markerOptions(options, accepted, requirement) {
    const keys = Reflect.ownKeys(options);
    if (keys.length === 0 || keys.some(key => typeof key !== 'string' || !accepted.has(key))
        || (Object.hasOwn(options, 'mode') && options.mode !== 'stream')) {
        throw new TypeError(`typert-protocol: ${requirement}`);
    }
    const { mode, name, resources } = options;
    if (name !== undefined)
        validateName('Remote export name', name);
    return {
        ...(mode === undefined ? {} : { mode }),
        ...(name === undefined ? {} : { exportName: name }),
        ...(resources === undefined ? {} : { resources: resourceReaders(resources) }),
    };
}
/** Freeze declared readers into the marker record; a misdeclared reader fails at decoration. */
function resourceReaders(resources) {
    const readers = {};
    for (const [kind, reader] of Object.entries(resources)) {
        if (typeof reader !== 'function') {
            throw new TypeError(`typert-protocol: Remote resource reader "${kind}" must be a function`);
        }
        readers[kind] = reader;
    }
    if (Object.keys(readers).length === 0)
        throw new TypeError('typert-protocol: Remote resources require at least one reader');
    return Object.freeze(readers);
}
function remoteDecorator(invocation, options = {}) {
    return function (_method, context) {
        addMarkerInitializer(context, invocation, options);
    };
}
export function RemoteScope(key, option) {
    validateName('Scope key', key);
    const invocation = { kind: 'context', context: key };
    if (option === undefined)
        return remoteDecorator(invocation);
    if (typeof option === 'string') {
        validateName('Remote export name', option);
        return remoteDecorator(invocation, { exportName: option });
    }
    return remoteDecorator(invocation, markerOptions(option, REMOTE_SCOPE_OPTION_KEYS, 'RemoteScope options require name or resources'));
}
/**
 * Read Remote markers attached to a live Service's class prototype.
 * The returned snapshot cannot mutate the stored descriptor.
 * @param service - live Service instance.
 * @returns markers in class declaration order.
 */
export function remoteMethods(service) {
    const prototype = Object.getPrototypeOf(service);
    if (prototype === null)
        return [];
    return (readRemoteMethodDescriptor(prototype)?.methods ?? []).map(marker => ({ ...marker }));
}
function readRemoteMethodDescriptor(prototype) {
    const property = Object.getOwnPropertyDescriptor(prototype, REMOTE_METHOD_DESCRIPTOR);
    if (property === undefined)
        return undefined;
    const descriptor = property.value;
    if (descriptor === null || typeof descriptor !== 'object') {
        throw new TypeError('typert-protocol: Remote method descriptor must be an object');
    }
    const version = Reflect.get(descriptor, 'version');
    if (version !== 1) {
        throw new TypeError(`typert-protocol: unsupported Remote method descriptor version ${String(version)}`);
    }
    const methods = Reflect.get(descriptor, 'methods');
    if (!Array.isArray(methods)) {
        throw new TypeError('typert-protocol: Remote method descriptor methods must be an array');
    }
    return descriptor;
}
function addMarkerInitializer(context, invocation, options = {}) {
    if (context.private || context.static || typeof context.name !== 'string') {
        throw new TypeError('typert-protocol: Remote decorators require a public instance method with a string name');
    }
    const method = context.name;
    context.addInitializer(function () {
        const prototype = Object.getPrototypeOf(this);
        if (prototype === null) {
            throw new TypeError(`typert-protocol: cannot mark Remote method "${method}" on an object without a prototype`);
        }
        mark(prototype, method, invocation, options);
    });
}
function mark(prototype, method, invocation, { mode, exportName, resources }) {
    const descriptor = readRemoteMethodDescriptor(prototype);
    const marker = Object.freeze({
        method,
        ...(exportName === undefined || exportName === method ? {} : { exportName }),
        ...(mode === undefined ? {} : { mode }),
        invocation: Object.freeze(invocation),
        ...(resources === undefined ? {} : { resources }),
    });
    const current = descriptor?.methods.find(candidate => candidate.method === method);
    if (current !== undefined) {
        // One decorator application owns one frozen reader record, so identity marks the same declaration.
        if (current.exportName === marker.exportName
            && current.mode === marker.mode
            && current.resources === marker.resources
            && sameInvocation(current.invocation, invocation))
            return;
        throw new Error(`typert-protocol: Remote method "${method}" has conflicting invocation markers`);
    }
    Object.defineProperty(prototype, REMOTE_METHOD_DESCRIPTOR, {
        configurable: true,
        value: Object.freeze({
            version: 1,
            methods: Object.freeze([...(descriptor?.methods ?? []), marker]),
        }),
    });
}
function sameInvocation(left, right) {
    if (left.kind === 'direct')
        return right.kind === 'direct';
    if (right.kind === 'direct')
        return false;
    return left.context === right.context;
}
function validateName(subject, value) {
    if (!isTypertRemoteSegment(value)) {
        throw new TypeError(`typert-protocol: ${subject} must contain only RPC endpoint segment characters`);
    }
}
//# sourceMappingURL=index.js.map